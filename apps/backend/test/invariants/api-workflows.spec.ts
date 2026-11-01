import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  assertEveryResponseSafe,
  assertStatus,
  startInvariantApi,
  type ApiRoute,
  type InvariantApi,
} from '../support/invariant-api.js';

const TEMP_PASSWORD = 'Temporary workflow password 2026!';

describe('Documented API workflows', () => {
  let api: InvariantApi;

  beforeAll(async () => {
    api = await startInvariantApi();
  });
  afterEach(() => {
    assertEveryResponseSafe(api);
    vi.useRealTimers();
  });
  afterAll(async () => api?.close());

  async function createSchool(admin: string, label: string) {
    const response = await api.send('POST', '/api/v1/schools', {
      cookie: admin,
      body: schoolBody(label),
    });
    assertStatus(response, 201);
    return response.body as { id: string; code: string; name: string };
  }

  async function createSection(admin: string, schoolId: string, className?: string) {
    const response = await api.send('POST', '/api/v1/class-sections', {
      cookie: admin,
      body: { schoolId, className: className ?? `Class ${randomUUID().slice(0, 8)}` },
    });
    assertStatus(response, 201);
    return response.body as { id: string; schoolId: string; className: string };
  }

  async function createTeacher(
    admin: string,
    schoolId: string,
    fields: Record<string, unknown> = {},
  ) {
    const response = await api.send('POST', '/api/v1/users/teachers', {
      cookie: admin,
      body: {
        schoolId,
        name: `Teacher ${randomUUID().slice(0, 8)}`,
        password: TEMP_PASSWORD,
        ...fields,
      },
    });
    assertStatus(response, 201);
    return response.body as {
      id: string;
      steamxId: string;
      name: string;
      schoolId: string;
      email: string | null;
      userType: string;
      mustChangePassword: boolean;
      profile: { primaryAssignment: string | null };
    };
  }

  async function createStudent(admin: string, schoolId: string, classSectionId: string) {
    const response = await api.send('POST', '/api/v1/users/students', {
      cookie: admin,
      body: {
        schoolId,
        classSectionId,
        name: `Student ${randomUUID().slice(0, 8)}`,
        password: TEMP_PASSWORD,
      },
    });
    assertStatus(response, 201);
    return response.body as {
      id: string;
      steamxId: string;
      schoolId: string;
      mustChangePassword: boolean;
      profile: { classSectionId: string; guardianName: string | null };
    };
  }

  async function loginAndChange(
    steamxId: string,
    password = TEMP_PASSWORD,
  ): Promise<{ cookie: string; password: string }> {
    const login = await api.login({ steamxId, password });
    expect(login.response.body.mustChangePassword).toBe(true);
    const newPassword = `Changed ${randomUUID().slice(0, 8)} workflow password 2026!`;
    const changed = await api.send('POST', '/api/v1/auth/change-password', {
      cookie: login.cookie,
      body: { currentPassword: password, newPassword },
    });
    assertStatus(changed, 200);
    expect(changed.body.mustChangePassword).toBe(false);
    return { cookie: cookieFrom(changed), password: newPassword };
  }

  it('creates schools, teachers, and students and completes each first login', async () => {
    const admin = (await api.login()).cookie;
    const schoolA = await createSchool(admin, 'Workflow School A');
    const schoolB = await createSchool(admin, 'Workflow School B');
    const sectionA = await createSection(admin, schoolA.id);
    const sectionB = await createSection(admin, schoolB.id);
    const teacherA = await createTeacher(admin, schoolA.id);
    const teacherB = await createTeacher(admin, schoolB.id);
    const studentA = await createStudent(admin, schoolA.id, sectionA.id);
    const studentB = await createStudent(admin, schoolB.id, sectionB.id);

    for (const user of [teacherA, teacherB, studentA, studentB]) {
      expect(user.mustChangePassword).toBe(true);
      expect(user.steamxId).toMatch(/^[A-Z0-9]{2,12}-[A-Z]{4,8}[0-9]{3}$/);
      const session = await loginAndChange(user.steamxId);
      const me = await api.send('GET', '/api/v1/auth/me', { cookie: session.cookie });
      assertStatus(me, 200);
      expect(me.body.mustChangePassword).toBe(false);
      expect(me.body).not.toHaveProperty('passwordHash');
      assertStatus(
        await api.send('GET', '/api/v1/schools', { cookie: session.cookie }),
        403,
        'PERMISSION_REQUIRED',
      );
    }
  });

  it('resets a password and verifies old-session revocation and forced password change', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow Reset School');
    const teacher = await createTeacher(admin, school.id);
    const current = await loginAndChange(teacher.steamxId);
    const resetPassword = 'Workflow reset password 2026!';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    assertStatus(
      await api.send('POST', `/api/v1/users/${teacher.id}/reset-password`, {
        cookie: admin,
        body: { newPassword: resetPassword },
      }),
      204,
    );
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: current.cookie }),
      401,
      'AUTHENTICATION_FAILED',
    );
    const resetLogin = await api.login({ steamxId: teacher.steamxId, password: resetPassword });
    expect(resetLogin.response.body.mustChangePassword).toBe(true);
    assertStatus(
      await api.send('GET', '/api/v1/schools', { cookie: resetLogin.cookie }),
      403,
      'PASSWORD_CHANGE_REQUIRED',
    );
    const oldPassword = await api.send('POST', '/api/v1/auth/login', {
      body: { steamxId: teacher.steamxId, password: current.password },
    });
    assertStatus(oldPassword, 401, 'AUTHENTICATION_FAILED');
    const forcedChange = await api.send('POST', '/api/v1/auth/change-password', {
      cookie: resetLogin.cookie,
      body: { currentPassword: resetPassword, newPassword: 'After reset workflow 2026!' },
    });
    assertStatus(forcedChange, 200);
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: cookieFrom(forcedChange) }),
      200,
    );
  });

  it('edits a user and completes deactivation, reactivation, no-op, and self-protection', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow Lifecycle School');
    const teacher = await createTeacher(admin, school.id, {
      email: `lifecycle-${randomUUID().slice(0, 8)}@example.com`,
      primaryAssignment: 'Original subject',
    });
    const session = await loginAndChange(teacher.steamxId);

    const edited = await api.send('PATCH', `/api/v1/users/${teacher.id}`, {
      cookie: admin,
      body: {
        name: '  Updated Workflow Teacher  ',
        email: '  UPDATED-WORKFLOW@EXAMPLE.COM ',
        primaryAssignment: '  Science  ',
      },
    });
    assertStatus(edited, 200);
    expect(edited.body).toMatchObject({
      name: 'Updated Workflow Teacher',
      email: 'updated-workflow@example.com',
      profile: { primaryAssignment: 'Science' },
    });

    assertStatus(
      await api.send('PATCH', `/api/v1/users/${teacher.id}/status`, {
        cookie: admin,
        body: { status: 'INACTIVE' },
      }),
      200,
    );
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: session.cookie }),
      401,
      'AUTHENTICATION_FAILED',
    );
    assertStatus(
      await api.send('POST', '/api/v1/auth/login', {
        body: { steamxId: teacher.steamxId, password: session.password },
      }),
      401,
      'AUTHENTICATION_FAILED',
    );
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${teacher.id}/status`, {
        cookie: admin,
        body: { status: 'ACTIVE' },
      }),
      200,
    );
    assertStatus(await api.send('GET', '/api/v1/auth/me', { cookie: session.cookie }), 200);
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${teacher.id}/status`, {
        cookie: admin,
        body: { status: 'ACTIVE' },
      }),
      200,
    );
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${api.admin.id}/status`, {
        cookie: admin,
        body: { status: 'INACTIVE' },
      }),
      400,
      'CANNOT_DEACTIVATE_SELF',
    );
  });

  it('changes a student section in-school, rejects foreign sections, and accepts a no-op', async () => {
    const admin = (await api.login()).cookie;
    const schoolA = await createSchool(admin, 'Workflow Class A');
    const schoolB = await createSchool(admin, 'Workflow Class B');
    const sectionA1 = await createSection(admin, schoolA.id);
    const sectionA2 = await createSection(admin, schoolA.id);
    const sectionB = await createSection(admin, schoolB.id);
    const student = await createStudent(admin, schoolA.id, sectionA1.id);

    const changed = await api.send('PATCH', `/api/v1/users/${student.id}`, {
      cookie: admin,
      body: { classSectionId: sectionA2.id },
    });
    assertStatus(changed, 200);
    expect(changed.body.profile.classSectionId).toBe(sectionA2.id);
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${student.id}`, {
        cookie: admin,
        body: { classSectionId: sectionB.id },
      }),
      404,
      'NOT_FOUND',
    );
    const current = await api.send('GET', `/api/v1/users/${student.id}`, { cookie: admin });
    expect(current.body.profile.classSectionId).toBe(sectionA2.id);
    const repeated = await api.send('PATCH', `/api/v1/users/${student.id}`, {
      cookie: admin,
      body: { classSectionId: sectionA2.id },
    });
    assertStatus(repeated, 200);
    expect(repeated.body.profile.classSectionId).toBe(sectionA2.id);
  });

  it('generates IDs for varied names and renames an ID while preserving old sessions', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow ID School');
    const variants = [
      ['short', 'Li'],
      ['single', 'Madonna'],
      ['honorific', 'Dr Ada Lovelace'],
      ['non-Latin', '東京'],
    ];
    const created = [];
    for (const [, name] of variants) {
      const teacher = await createTeacher(admin, school.id, { name });
      expect(teacher.steamxId).toMatch(new RegExp(`^${school.code}-[A-Z]{4,8}[0-9]{3}$`));
      created.push(teacher);
    }
    expect(new Set(created.map((user) => user.steamxId)).size).toBe(created.length);
    const target = created[2]!;
    const oldId = target.steamxId;
    const oldSession = await loginAndChange(oldId);
    const renamedId = `${school.code}-WORKFLOW001`;
    const renamed = await api.send('PATCH', `/api/v1/users/${target.id}/steamx-id`, {
      cookie: admin,
      body: { steamxId: renamedId },
    });
    assertStatus(renamed, 200);
    expect(renamed.body.steamxId).toBe(renamedId);
    assertStatus(await api.send('GET', '/api/v1/auth/me', { cookie: oldSession.cookie }), 200);
    assertStatus(
      await api.send('POST', '/api/v1/auth/login', {
        body: { steamxId: oldId, password: oldSession.password },
      }),
      401,
      'AUTHENTICATION_FAILED',
    );
    assertStatus(
      await api.send('POST', '/api/v1/auth/login', {
        body: { steamxId: renamedId, password: oldSession.password },
      }),
      200,
    );
  });

  it('walks the default permission matrix for admin, teacher, and student', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow Permission School');
    const section = await createSection(admin, school.id);
    const teacher = await createTeacher(admin, school.id);
    const student = await createStudent(admin, school.id, section.id);
    const teacherSession = await loginAndChange(teacher.steamxId);
    const studentSession = await loginAndChange(student.steamxId);

    for (const session of [teacherSession, studentSession]) {
      assertStatus(await api.send('GET', '/api/v1/auth/me', { cookie: session.cookie }), 200);
      assertStatus(
        await api.send('POST', '/api/v1/auth/logout', {
          cookie: session.cookie,
          body: {},
        }),
        204,
      );
      for (const route of api.routes.filter(isBackendRoute)) {
        if (isPublicRoute(route) || isSessionOnlyRoute(route)) {
          continue;
        }
        const options: { body?: object } = {};
        if (route.method === 'POST' || route.method === 'PATCH' || route.method === 'DELETE') {
          options.body = {};
          if (route.method === 'POST' && route.path.endsWith('/deliveries/:id/enrollments')) {
            options.body = { studentIds: [randomUUID()] };
          }
        }
        const response = await api.send(route.method, concretePath(route), {
          cookie: session.cookie,
          ...options,
        });
        if (session === teacherSession && route.path.includes('/deliveries/:id/enrollments')) {
          assertStatus(response, 404, 'NOT_FOUND');
          continue;
        }
        if (session === teacherSession && route.path.includes('/deliveries/:id/releases')) {
          assertStatus(response, 404, 'NOT_FOUND');
          continue;
        }
        if (
          session === teacherSession &&
          route.method === 'GET' &&
          route.path.includes('deliveries') &&
          !route.path.includes('/teachers')
        ) {
          assertStatus(response, route.path.endsWith('/deliveries') ? 200 : 404);
          continue;
        }
        assertStatus(response, 403, 'PERMISSION_REQUIRED');
      }
    }
    assertStatus(await api.send('GET', '/api/v1/schools', { cookie: admin }), 200);
    assertStatus(await api.send('GET', '/api/v1/users', { cookie: admin }), 200);
  });

  it('filters and paginates the user list with consistent ordering and page boundaries', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow List School');
    const prefix = `Walk${randomUUID().slice(0, 7)}`;
    const first = await createTeacher(admin, school.id, {
      name: `${prefix} First`,
      email: `${prefix.toLowerCase()}-first@example.com`,
    });
    const second = await createTeacher(admin, school.id, {
      name: `${prefix} Second`,
      email: `${prefix.toLowerCase()}-second@example.com`,
    });
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${second.id}/status`, {
        cookie: admin,
        body: { status: 'INACTIVE' },
      }),
      200,
    );

    const defaults = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: prefix },
    });
    assertStatus(defaults, 200);
    expect(defaults.body).toMatchObject({ page: 1, limit: 20, total: 2 });

    const filters: Record<string, string | number>[] = [
      { schoolId: school.id, q: prefix },
      { role: 'teacher', q: prefix },
      { status: 'INACTIVE', q: prefix },
      { q: `${prefix.toLowerCase()} first` },
      { q: `${first.steamxId.slice(-5).toLowerCase()}` },
      { q: `${prefix.toLowerCase()}-first` },
      { schoolId: school.id, role: 'teacher', status: 'ACTIVE', q: prefix },
    ];
    for (const query of filters) {
      const result = await api.send('GET', '/api/v1/users', { cookie: admin, query });
      assertStatus(result, 200);
      expect(JSON.stringify(result.body)).not.toContain('passwordHash');
    }
    const firstPage = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: prefix, limit: 1 },
    });
    const secondPage = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: prefix, limit: 1, page: 2 },
    });
    const repeatedFirstPage = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: prefix, limit: 1 },
    });
    expect(firstPage.body.items).toHaveLength(1);
    expect(secondPage.body.items).toHaveLength(1);
    expect(repeatedFirstPage.body.items[0].id).toBe(firstPage.body.items[0].id);
    expect(firstPage.body.total).toBe(2);
    expect(secondPage.body.total).toBe(2);
    const pageAfterLast = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: prefix, limit: 1, page: 3 },
    });
    expect(pageAfterLast.body).toMatchObject({ total: 2, items: [] });
    expect([first.id, second.id]).toContain(firstPage.body.items[0].id);
    expect([first.id, second.id]).toContain(secondPage.body.items[0].id);
    expect(firstPage.body.items[0].id).not.toBe(secondPage.body.items[0].id);
    assertStatus(
      await api.send('GET', '/api/v1/users', {
        cookie: admin,
        query: { limit: 101 },
      }),
      400,
      'VALIDATION_ERROR',
    );
    assertStatus(
      await api.send('GET', '/api/v1/users', {
        cookie: admin,
        query: { page: 100001 },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('handles duplicate submit and corrected retries without partial user data', async () => {
    const admin = (await api.login()).cookie;
    const school = await createSchool(admin, 'Workflow Retry School');
    const codeBody = schoolBody('Duplicate code');
    codeBody.code = school.code;
    assertStatus(
      await api.send('POST', '/api/v1/schools', { cookie: admin, body: codeBody }),
      409,
      'SCHOOL_CODE_EXISTS',
    );
    const correctedSchool = await api.send('POST', '/api/v1/schools', {
      cookie: admin,
      body: schoolBody('Corrected duplicate code'),
    });
    assertStatus(correctedSchool, 201);

    const sectionName = `Retry ${randomUUID().slice(0, 8)}`;
    const sectionBody = { schoolId: school.id, className: sectionName };
    assertStatus(
      await api.send('POST', '/api/v1/class-sections', { cookie: admin, body: sectionBody }),
      201,
    );
    assertStatus(
      await api.send('POST', '/api/v1/class-sections', { cookie: admin, body: sectionBody }),
      409,
      'CLASS_SECTION_EXISTS',
    );
    const correctedSection = await createSection(admin, school.id, `${sectionName} corrected`);
    expect(correctedSection.className).toBe(`${sectionName} corrected`);

    const email = `retry-${randomUUID().slice(0, 8)}@example.com`;
    const owner = await createTeacher(admin, school.id, { email });
    const duplicateEmailName = `Duplicate email retry ${randomUUID().slice(0, 8)}`;
    assertStatus(
      await api.send('POST', '/api/v1/users/teachers', {
        cookie: admin,
        body: {
          schoolId: school.id,
          name: duplicateEmailName,
          password: TEMP_PASSWORD,
          email,
        },
      }),
      409,
      'CONFLICT',
    );
    const correctedEmailCreate = await createTeacher(admin, school.id, {
      name: duplicateEmailName,
      email: `corrected-${randomUUID().slice(0, 8)}@example.com`,
    });
    expect(correctedEmailCreate.id).not.toBe(owner.id);

    const invalidCreateName = `Invalid then retry ${randomUUID().slice(0, 8)}`;
    assertStatus(
      await api.send('POST', '/api/v1/users/teachers', {
        cookie: admin,
        body: {
          schoolId: school.id,
          name: invalidCreateName,
          password: TEMP_PASSWORD,
          email: 'not-an-email',
        },
      }),
      400,
      'VALIDATION_ERROR',
    );
    const invalidSearch = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: invalidCreateName },
    });
    expect(invalidSearch.body.items).toEqual([]);
    const retry = await createTeacher(admin, school.id, {
      name: invalidCreateName,
      email: `corrected-${randomUUID().slice(0, 8)}@example.com`,
    });
    expect(retry.name).toBe(invalidCreateName);
    expect(retry.id).not.toBe(owner.id);

    const duplicateSubmitName = `Repeated create ${randomUUID().slice(0, 8)}`;
    const duplicateFirst = await createTeacher(admin, school.id, { name: duplicateSubmitName });
    const duplicateSecond = await createTeacher(admin, school.id, { name: duplicateSubmitName });
    expect(duplicateSecond.id).not.toBe(duplicateFirst.id);
    expect(duplicateSecond.steamxId).not.toBe(duplicateFirst.steamxId);
  });
});

function schoolBody(label: string) {
  return {
    code: `W${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`,
    name: `${label} ${randomUUID().slice(0, 6)}`,
    city: 'Workflow City',
    state: 'Workflow State',
    postalCode: '12345',
    country: 'Test Country',
  };
}

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }): string {
  const cookie = response.headers['set-cookie'];
  const first = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!first) {
    throw new Error('Password change did not refresh the session cookie.');
  }
  return first.split(';', 1)[0]!;
}

function concretePath(route: ApiRoute): string {
  return route.path.replace(/:[A-Za-z0-9_]+/g, () => randomUUID()).replace(/\*[\w]+/g, 'live');
}

function isBackendRoute(route: ApiRoute): boolean {
  return route.path.startsWith('/api/v1/') || route.path.startsWith('/health/');
}

function isPublicRoute(route: ApiRoute): boolean {
  return route.path === '/api/v1/auth/login' || route.path.startsWith('/health/');
}

function isSessionOnlyRoute(route: ApiRoute): boolean {
  return ['/api/v1/auth/me', '/api/v1/auth/logout', '/api/v1/auth/change-password'].includes(
    route.path,
  );
}
