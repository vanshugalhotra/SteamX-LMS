import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSION } from '../../src/auth/permissions.js';
import {
  assertEveryResponseSafe,
  assertStatus,
  startInvariantApi,
  type InvariantApi,
} from '../support/invariant-api.js';

describe('Two-school isolation workflow', () => {
  let api: InvariantApi;
  beforeAll(async () => {
    api = await startInvariantApi({
      teacherPermissions: [
        PERMISSION.SCHOOL_READ,
        PERMISSION.CLASSSECTION_READ,
        PERMISSION.USER_READ,
      ],
    });
  });
  afterEach(() => assertEveryResponseSafe(api));
  afterAll(async () => api?.close());

  it('keeps two API-created school setups isolated for staff and platform users', async () => {
    const admin = (await api.login()).cookie;
    const schoolA = await createSchool(api, admin, 'Walkthrough A');
    const schoolB = await createSchool(api, admin, 'Walkthrough B');
    const sectionA = await createSection(api, admin, schoolA.id, 'A Class');
    const sectionB = await createSection(api, admin, schoolB.id, 'B Class');
    const teacherA = await createTeacher(api, admin, schoolA.id, 'School A Teacher');
    const teacherB = await createTeacher(api, admin, schoolB.id, 'School B Teacher');
    await createStudent(api, admin, schoolA.id, sectionA.id);
    const studentB = await createStudent(api, admin, schoolB.id, sectionB.id);
    const sessionA = await loginAndChange(api, teacherA.steamxId);
    const sessionB = await loginAndChange(api, teacherB.steamxId);

    assertStatus(await api.send('GET', `/api/v1/schools/${schoolA.id}`, { cookie: admin }), 200);
    assertStatus(await api.send('GET', `/api/v1/schools/${schoolB.id}`, { cookie: admin }), 200);
    assertStatus(
      await api.send('GET', `/api/v1/schools/${schoolA.id}`, { cookie: sessionA.cookie }),
      200,
    );
    assertStatus(
      await api.send('GET', `/api/v1/schools/${schoolB.id}`, { cookie: sessionA.cookie }),
      404,
      'NOT_FOUND',
    );
    const schoolsA = await api.send('GET', '/api/v1/schools', { cookie: sessionA.cookie });
    assertStatus(schoolsA, 200);
    expect(schoolsA.body.items.map((item: { id: string }) => item.id)).toEqual([schoolA.id]);
    const listA = await api.send('GET', '/api/v1/class-sections', { cookie: sessionA.cookie });
    assertStatus(listA, 200);
    expect(
      listA.body.items.every((item: { schoolId: string }) => item.schoolId === schoolA.id),
    ).toBe(true);
    assertStatus(
      await api.send('GET', '/api/v1/class-sections', {
        cookie: sessionA.cookie,
        query: { schoolId: schoolB.id },
      }),
      404,
      'NOT_FOUND',
    );
    const foreignSection = await api.send('GET', `/api/v1/class-sections/${sectionB.id}`, {
      cookie: sessionA.cookie,
    });
    const missingSection = await api.send('GET', `/api/v1/class-sections/${randomUUID()}`, {
      cookie: sessionA.cookie,
    });
    assertStatus(foreignSection, 404, 'NOT_FOUND');
    assertStatus(missingSection, 404, 'NOT_FOUND');
    expect(foreignSection.body.code).toBe(missingSection.body.code);
    expect(foreignSection.body.message).toBe(missingSection.body.message);

    assertStatus(
      await api.send('GET', `/api/v1/schools/${schoolB.id}`, { cookie: sessionB.cookie }),
      200,
    );
    assertStatus(
      await api.send('GET', `/api/v1/schools/${schoolA.id}`, { cookie: sessionB.cookie }),
      404,
      'NOT_FOUND',
    );
    const schoolsB = await api.send('GET', '/api/v1/schools', { cookie: sessionB.cookie });
    assertStatus(schoolsB, 200);
    expect(schoolsB.body.items.map((item: { id: string }) => item.id)).toEqual([schoolB.id]);
    const listB = await api.send('GET', '/api/v1/class-sections', { cookie: sessionB.cookie });
    assertStatus(listB, 200);
    expect(
      listB.body.items.every((item: { schoolId: string }) => item.schoolId === schoolB.id),
    ).toBe(true);
    assertStatus(
      await api.send('GET', '/api/v1/class-sections', {
        cookie: sessionB.cookie,
        query: { schoolId: schoolA.id },
      }),
      404,
      'NOT_FOUND',
    );
    const foreignSectionB = await api.send('GET', `/api/v1/class-sections/${sectionA.id}`, {
      cookie: sessionB.cookie,
    });
    const missingSectionB = await api.send('GET', `/api/v1/class-sections/${randomUUID()}`, {
      cookie: sessionB.cookie,
    });
    assertStatus(foreignSectionB, 404, 'NOT_FOUND');
    assertStatus(missingSectionB, 404, 'NOT_FOUND');
    expect(foreignSectionB.body.code).toBe(missingSectionB.body.code);
    expect(foreignSectionB.body.message).toBe(missingSectionB.body.message);

    assertStatus(await api.send('GET', '/api/v1/users', { cookie: sessionB.cookie }), 200);
    const ownUsers = await api.send('GET', '/api/v1/users', { cookie: sessionB.cookie });
    expect(ownUsers.body.items.map((item: { id: string }) => item.id)).toEqual([teacherB.id]);
    const hiddenUserSearch = await api.send('GET', '/api/v1/users', {
      cookie: sessionB.cookie,
      query: { q: studentB.steamxId },
    });
    assertStatus(hiddenUserSearch, 200);
    expect(hiddenUserSearch.body.items).toEqual([]);
    assertStatus(
      await api.send('GET', '/api/v1/users', {
        cookie: sessionB.cookie,
        query: { schoolId: schoolA.id },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('GET', `/api/v1/users/${teacherA.id}`, { cookie: sessionB.cookie }),
      404,
      'NOT_FOUND',
    );
    const platformUsers = await api.send('GET', '/api/v1/users', { cookie: admin });
    expect(platformUsers.body.items.map((item: { id: string }) => item.id)).toContain(teacherA.id);
    expect(platformUsers.body.items.map((item: { id: string }) => item.id)).toContain(teacherB.id);
    const platformSchoolUsers = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { schoolId: schoolA.id },
    });
    expect(
      platformSchoolUsers.body.items.every(
        (item: { schoolId: string }) => item.schoolId === schoolA.id,
      ),
    ).toBe(true);
  });
});

async function createSchool(api: InvariantApi, cookie: string, name: string) {
  const response = await api.send('POST', '/api/v1/schools', {
    cookie,
    body: {
      code: `W${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`,
      name: `${name} ${randomUUID().slice(0, 8)}`,
      city: 'Workflow City',
      state: 'Workflow State',
      postalCode: '12345',
      country: 'Test Country',
    },
  });
  assertStatus(response, 201);
  return response.body as { id: string; code: string };
}

async function createSection(
  api: InvariantApi,
  cookie: string,
  schoolId: string,
  className: string,
) {
  const response = await api.send('POST', '/api/v1/class-sections', {
    cookie,
    body: { schoolId, className },
  });
  assertStatus(response, 201);
  return response.body as { id: string; schoolId: string };
}

async function createTeacher(api: InvariantApi, cookie: string, schoolId: string, name: string) {
  const response = await api.send('POST', '/api/v1/users/teachers', {
    cookie,
    body: { schoolId, name, password: 'Temporary workflow password 2026!' },
  });
  assertStatus(response, 201);
  return response.body as { id: string; steamxId: string };
}

async function createStudent(
  api: InvariantApi,
  cookie: string,
  schoolId: string,
  classSectionId: string,
) {
  const response = await api.send('POST', '/api/v1/users/students', {
    cookie,
    body: {
      schoolId,
      classSectionId,
      name: `School isolation student ${randomUUID().slice(0, 8)}`,
      password: 'Temporary workflow password 2026!',
    },
  });
  assertStatus(response, 201);
  return response.body as { id: string; steamxId: string };
}

async function loginAndChange(api: InvariantApi, steamxId: string) {
  const password = 'Temporary workflow password 2026!';
  const login = await api.login({ steamxId, password });
  const updatedPassword = `Changed ${steamxId.slice(-4)} workflow password 2026!`;
  const changed = await api.send('POST', '/api/v1/auth/change-password', {
    cookie: login.cookie,
    body: { currentPassword: password, newPassword: updatedPassword },
  });
  assertStatus(changed, 200);
  const setCookie = changed.headers['set-cookie']?.[0];
  if (!setCookie) {
    throw new Error('Password change did not issue a refreshed session.');
  }
  return { cookie: setCookie.split(';', 1)[0]! };
}
