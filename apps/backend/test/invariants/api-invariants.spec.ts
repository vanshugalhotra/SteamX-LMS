import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PERMISSION } from '../../src/auth/permissions.js';
import {
  assertEveryResponseSafe,
  assertStatus,
  startInvariantApi,
  type ApiRoute,
  type InvariantApi,
} from '../support/invariant-api.js';

const TEACHER_PERMISSIONS = [
  PERMISSION.SCHOOL_READ,
  PERMISSION.SCHOOL_MANAGE,
  PERMISSION.CLASSSECTION_READ,
  PERMISSION.CLASSSECTION_MANAGE,
  PERMISSION.USER_READ,
  PERMISSION.USER_CREATE_TEACHER,
  PERMISSION.USER_CREATE_STUDENT,
  PERMISSION.USER_UPDATE,
  PERMISSION.USER_DEACTIVATE,
  PERMISSION.USER_PASSWORD_RESET,
  PERMISSION.USER_STEAMX_ID_UPDATE,
] as const;

describe('Black-box API invariants', () => {
  let api: InvariantApi;

  beforeAll(async () => {
    api = await startInvariantApi({ teacherPermissions: [...TEACHER_PERMISSIONS] });
  });
  afterEach(() => {
    assertEveryResponseSafe(api);
    vi.useRealTimers();
  });
  afterAll(async () => api?.close());

  async function adminCookie(): Promise<string> {
    return (await api.login()).cookie;
  }

  async function createSchool(cookie: string, label: string) {
    const code = `I${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`;
    const response = await api.send('POST', '/api/v1/schools', {
      cookie,
      body: {
        code,
        name: `${label} ${randomUUID().slice(0, 8)}`,
        city: 'Invariant City',
        state: 'Test State',
        postalCode: '10000',
        country: 'Test Country',
      },
    });
    assertStatus(response, 201);
    return response.body as { id: string; code: string; name: string };
  }

  async function createSection(cookie: string, schoolId: string, className?: string) {
    const response = await api.send('POST', '/api/v1/class-sections', {
      cookie,
      body: {
        schoolId,
        className: className ?? `Class ${randomUUID().slice(0, 8)}`,
      },
    });
    assertStatus(response, 201);
    return response.body as {
      id: string;
      schoolId: string;
      className: string;
      sectionName: string;
    };
  }

  async function createTeacher(cookie: string, schoolId: string, name?: string, email?: string) {
    const response = await api.send('POST', '/api/v1/users/teachers', {
      cookie,
      body: {
        schoolId,
        name: name ?? `Teacher ${randomUUID().slice(0, 8)}`,
        password: 'Temporary invariant password 2026!',
        ...(email === undefined ? {} : { email }),
      },
    });
    assertStatus(response, 201);
    return response.body as {
      id: string;
      steamxId: string;
      name: string;
      email: string | null;
      schoolId: string;
      userType: string;
      mustChangePassword: boolean;
      profile: { primaryAssignment: string | null };
    };
  }

  async function createStudent(
    cookie: string,
    schoolId: string,
    classSectionId: string,
    name?: string,
  ) {
    const response = await api.send('POST', '/api/v1/users/students', {
      cookie,
      body: {
        schoolId,
        classSectionId,
        name: name ?? `Student ${randomUUID().slice(0, 8)}`,
        password: 'Temporary invariant password 2026!',
      },
    });
    assertStatus(response, 201);
    return response.body as {
      id: string;
      steamxId: string;
      name: string;
      schoolId: string;
      userType: string;
      mustChangePassword: boolean;
      profile: { classSectionId: string; guardianName: string | null };
    };
  }

  async function loginAndChangePassword(
    user: { steamxId: string; password: string },
    newPassword = `Changed ${randomUUID().slice(0, 8)} password 2026!`,
  ): Promise<{ cookie: string; password: string }> {
    const login = await api.login(user);
    const change = await api.send('POST', '/api/v1/auth/change-password', {
      cookie: login.cookie,
      body: { currentPassword: user.password, newPassword },
    });
    assertStatus(change, 200);
    return { cookie: cookieFrom(change), password: newPassword };
  }

  it('returns 401 without a cookie for every non-public route registered by the running app', async () => {
    expect(api.routes.length).toBeGreaterThan(10);
    expectAssetRoutesAreEnumerated(api.routes);
    for (const route of api.routes.filter(isBackendRoute)) {
      const path = concretePath(route);
      const options: { body?: object } = {};
      if (route.method === 'POST' || route.method === 'PATCH' || route.method === 'DELETE') {
        options.body = {};
      }
      const response = await api.send(route.method, path, options);
      if (isPublicRoute(route)) {
        expect(response.status, `${route.method} ${route.path} is public`).not.toBe(401);
      } else {
        try {
          assertStatus(response, 401, 'UNAUTHORIZED');
        } catch (error) {
          throw new Error(`${route.method} ${route.path} did not require authentication.`, {
            cause: error,
          });
        }
      }
    }
  });

  // Known gap: Swagger's static UI route is public despite the API-only public allow-list.
  it.fails('protects registered Swagger UI routes from anonymous access', async () => {
    const swaggerRoutes = api.routes.filter(
      (route) => !isBackendRoute(route) && !isPublicRoute(route),
    );
    expect(swaggerRoutes.length).toBeGreaterThan(0);
    for (const route of swaggerRoutes) {
      assertStatus(await api.send(route.method, concretePath(route)), 401, 'UNAUTHORIZED');
    }
  });

  it('requires an explicit permission on every non-public, non-session-only route', async () => {
    expectAssetRoutesAreEnumerated(api.routes);
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Permission sweep school');
    const section = await createSection(admin, school.id);
    const student = await createStudent(admin, school.id, section.id);
    const studentSession = await loginAndChangePassword({
      steamxId: student.steamxId,
      password: 'Temporary invariant password 2026!',
    });

    for (const route of api.routes.filter(isBackendRoute)) {
      if (isPublicRoute(route) || isSessionOnlyRoute(route)) {
        continue;
      }
      const response = await api.send(route.method, concretePath(route), {
        cookie: studentSession.cookie,
        ...(route.method === 'POST' || route.method === 'PATCH' || route.method === 'DELETE'
          ? { body: {} }
          : {}),
      });
      try {
        assertStatus(response, 403, 'FORBIDDEN');
      } catch (error) {
        throw new Error(`${route.method} ${route.path} did not require a permission.`, {
          cause: error,
        });
      }
    }
  });

  it('hides School A resources from School B staff across reads, lists, and mutations', async () => {
    const admin = await adminCookie();
    const schoolA = await createSchool(admin, 'Isolation A');
    const schoolB = await createSchool(admin, 'Isolation B');
    const sectionA = await createSection(admin, schoolA.id);
    const sectionB = await createSection(admin, schoolB.id);
    const teacherA = await createTeacher(admin, schoolA.id);
    const teacherB = await createTeacher(admin, schoolB.id);
    const studentA = await createStudent(admin, schoolA.id, sectionA.id);
    await createStudent(admin, schoolB.id, sectionB.id);
    const schoolBSession = await loginAndChangePassword({
      steamxId: teacherB.steamxId,
      password: 'Temporary invariant password 2026!',
    });

    assertStatus(
      await api.send('GET', `/api/v1/schools/${schoolA.id}`, { cookie: schoolBSession.cookie }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('PATCH', `/api/v1/schools/${schoolA.id}`, {
        cookie: schoolBSession.cookie,
        body: { name: 'Foreign update attempt' },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('PATCH', `/api/v1/schools/${schoolA.id}/status`, {
        cookie: schoolBSession.cookie,
        body: { status: 'INACTIVE' },
      }),
      404,
      'NOT_FOUND',
    );

    assertStatus(
      await api.send('GET', `/api/v1/class-sections/${sectionA.id}`, {
        cookie: schoolBSession.cookie,
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('GET', '/api/v1/class-sections', {
        cookie: schoolBSession.cookie,
        query: { schoolId: schoolA.id },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('POST', '/api/v1/class-sections', {
        cookie: schoolBSession.cookie,
        body: { schoolId: schoolA.id, className: 'Foreign create' },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('PATCH', `/api/v1/class-sections/${sectionA.id}`, {
        cookie: schoolBSession.cookie,
        body: { className: 'Foreign edit' },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('DELETE', `/api/v1/class-sections/${sectionA.id}`, {
        cookie: schoolBSession.cookie,
      }),
      404,
      'NOT_FOUND',
    );
    const scopedSections = await api.send('GET', '/api/v1/class-sections', {
      cookie: schoolBSession.cookie,
    });
    assertStatus(scopedSections, 200);
    expect(
      scopedSections.body.items.every((item: { schoolId: string }) => item.schoolId === schoolB.id),
    ).toBe(true);

    for (const target of [teacherA, studentA]) {
      assertStatus(
        await api.send('GET', `/api/v1/users/${target.id}`, { cookie: schoolBSession.cookie }),
        404,
        'NOT_FOUND',
      );
      assertStatus(
        await api.send('PATCH', `/api/v1/users/${target.id}`, {
          cookie: schoolBSession.cookie,
          body: { name: 'Foreign user edit' },
        }),
        404,
        'NOT_FOUND',
      );
      assertStatus(
        await api.send('PATCH', `/api/v1/users/${target.id}/status`, {
          cookie: schoolBSession.cookie,
          body: { status: 'INACTIVE' },
        }),
        404,
        'NOT_FOUND',
      );
      assertStatus(
        await api.send('POST', `/api/v1/users/${target.id}/reset-password`, {
          cookie: schoolBSession.cookie,
          body: { newPassword: 'Foreign reset password 2026!' },
        }),
        404,
        'NOT_FOUND',
      );
      assertStatus(
        await api.send('PATCH', `/api/v1/users/${target.id}/steamx-id`, {
          cookie: schoolBSession.cookie,
          body: { steamxId: `${schoolA.code}-FOREIGN001` },
        }),
        404,
        'NOT_FOUND',
      );
    }
    assertStatus(
      await api.send('POST', '/api/v1/users/teachers', {
        cookie: schoolBSession.cookie,
        body: {
          schoolId: schoolA.id,
          name: 'Foreign scoped create',
          password: 'Temporary invariant password 2026!',
        },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('POST', '/api/v1/users/students', {
        cookie: schoolBSession.cookie,
        body: {
          schoolId: schoolB.id,
          classSectionId: sectionA.id,
          name: 'Foreign section create',
          password: 'Temporary invariant password 2026!',
        },
      }),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await api.send('GET', '/api/v1/users', {
        cookie: schoolBSession.cookie,
        query: { schoolId: schoolA.id },
      }),
      404,
      'NOT_FOUND',
    );
    const ownUsers = await api.send('GET', '/api/v1/users', {
      cookie: schoolBSession.cookie,
    });
    assertStatus(ownUsers, 200);
    expect(ownUsers.body.items.map((user: { id: string }) => user.id)).toEqual([teacherB.id]);
    const allSchools = await api.send('GET', '/api/v1/schools', { cookie: admin });
    assertStatus(allSchools, 200);
    expect(allSchools.body.items.map((item: { id: string }) => item.id)).toContain(schoolA.id);
    expect(allSchools.body.items.map((item: { id: string }) => item.id)).toContain(schoolB.id);

    const platformUsers = await api.send('GET', '/api/v1/users', { cookie: admin });
    const platformSchoolA = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { schoolId: schoolA.id },
    });
    expect(platformUsers.body.items.map((item: { id: string }) => item.id)).toContain(teacherB.id);
    expect(
      platformSchoolA.body.items.every(
        (item: { schoolId: string }) => item.schoolId === schoolA.id,
      ),
    ).toBe(true);
  });

  it.each([
    ['deactivated user', 'user'],
    ['inactive school user', 'school'],
  ])('rejects a %s on every protected route', async (_caseName, invalidation) => {
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Protected route sweep');
    const teacher = await createTeacher(admin, school.id);
    const session = await loginAndChangePassword({
      steamxId: teacher.steamxId,
      password: 'Temporary invariant password 2026!',
    });

    if (invalidation === 'user') {
      assertStatus(
        await api.send('PATCH', `/api/v1/users/${teacher.id}/status`, {
          cookie: admin,
          body: { status: 'INACTIVE' },
        }),
        200,
      );
    } else {
      assertStatus(
        await api.send('PATCH', `/api/v1/schools/${school.id}/status`, {
          cookie: admin,
          body: { status: 'INACTIVE' },
        }),
        200,
      );
    }

    for (const route of api.routes.filter(
      (candidate) => isBackendRoute(candidate) && !isPublicRoute(candidate),
    )) {
      const response = await api.send(route.method, concretePath(route), {
        cookie: session.cookie,
        ...(route.method === 'POST' || route.method === 'PATCH' || route.method === 'DELETE'
          ? { body: {} }
          : {}),
      });
      try {
        assertStatus(response, 401, 'UNAUTHORIZED');
      } catch (error) {
        throw new Error(
          `${route.method} ${route.path} did not reject the ${invalidation} account.`,
          { cause: error },
        );
      }
    }
  });

  it('revokes sessions issued before both password changes and password resets', async () => {
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Revocation school');
    const teacher = await createTeacher(admin, school.id);
    const original = 'Temporary invariant password 2026!';
    const oldSession = await api.login({ steamxId: teacher.steamxId, password: original });
    const secondOldSession = await api.login({ steamxId: teacher.steamxId, password: original });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2_000);
    const changed = await api.send('POST', '/api/v1/auth/change-password', {
      cookie: oldSession.cookie,
      body: { currentPassword: original, newPassword: 'Changed invariant password 2026!' },
    });
    assertStatus(changed, 200);
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: oldSession.cookie }),
      401,
      'UNAUTHORIZED',
    );
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: secondOldSession.cookie }),
      401,
      'UNAUTHORIZED',
    );

    const changedSession = cookieFrom(changed);
    const resetLogin = await api.login({
      steamxId: teacher.steamxId,
      password: 'Changed invariant password 2026!',
    });
    const secondResetLogin = await api.login({
      steamxId: teacher.steamxId,
      password: 'Changed invariant password 2026!',
    });
    vi.setSystemTime(Date.now() + 2_000);
    assertStatus(
      await api.send('POST', `/api/v1/users/${teacher.id}/reset-password`, {
        cookie: admin,
        body: { newPassword: 'Reset invariant password 2026!' },
      }),
      204,
    );
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: resetLogin.cookie }),
      401,
      'UNAUTHORIZED',
    );
    assertStatus(
      await api.send('GET', '/api/v1/auth/me', { cookie: secondResetLogin.cookie }),
      401,
      'UNAUTHORIZED',
    );
    const newLogin = await api.login({
      steamxId: teacher.steamxId,
      password: 'Reset invariant password 2026!',
    });
    expect(newLogin.response.body.mustChangePassword).toBe(true);
    expect(changedSession).not.toBe(oldSession.cookie);
  });

  it('keeps user type, school, and SteamX ID stable across valid edits except admin rename', async () => {
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Identity invariants');
    const teacher = await createTeacher(
      admin,
      school.id,
      'Stable Identity',
      'identity@example.com',
    );
    const initialId = teacher.steamxId;

    const update = await api.send('PATCH', `/api/v1/users/${teacher.id}`, {
      cookie: admin,
      body: {
        name: 'Renamed Display Name',
        email: ' UPDATED@EXAMPLE.COM ',
        primaryAssignment: '  Languages  ',
      },
    });
    assertStatus(update, 200);
    expect(update.body).toMatchObject({
      userType: teacher.userType,
      schoolId: school.id,
      steamxId: initialId,
      name: 'Renamed Display Name',
    });
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${teacher.id}`, {
        cookie: admin,
        body: { schoolId: randomUUID(), userType: 'STUDENT', steamxId: `${school.code}-MUTATE001` },
      }),
      400,
      'VALIDATION_ERROR',
    );
    const afterInvalid = await api.send('GET', `/api/v1/users/${teacher.id}`, { cookie: admin });
    expect(afterInvalid.body).toMatchObject({
      userType: teacher.userType,
      schoolId: school.id,
      steamxId: initialId,
    });
    const newId = `${school.code}-ADMREN001`;
    const renamed = await api.send('PATCH', `/api/v1/users/${teacher.id}/steamx-id`, {
      cookie: admin,
      body: { steamxId: newId },
    });
    assertStatus(renamed, 200);
    expect(renamed.body).toMatchObject({
      userType: teacher.userType,
      schoolId: school.id,
      steamxId: newId,
    });
  });

  it('keeps generated IDs unique and school-prefixed and returns users with required profiles', async () => {
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Generated identity school');
    const section = await createSection(admin, school.id);
    const teacher = await createTeacher(admin, school.id, 'Generated Teacher');
    const student = await createStudent(admin, school.id, section.id, 'Generated Student');
    const users = [teacher, student];
    const ids = users.map((user) => user.steamxId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const user of users) {
      expect(user.steamxId).toMatch(new RegExp(`^${school.code}-[A-Z]{4,8}[0-9]{3}$`));
    }
    expect(teacher.profile).toMatchObject({ primaryAssignment: null });
    expect(student.profile.classSectionId).toBe(section.id);
    expect(teacher.mustChangePassword).toBe(true);
    expect(student.mustChangePassword).toBe(true);
    const studentStored = await api.prisma.studentProfile.findUniqueOrThrow({
      where: { userId: student.id },
      select: { schoolId: true, classSectionId: true },
    });
    const teacherStored = await api.prisma.teacherProfile.findUniqueOrThrow({
      where: { userId: teacher.id },
      select: { schoolId: true },
    });
    expect(studentStored).toEqual({ schoolId: school.id, classSectionId: section.id });
    expect(teacherStored.schoolId).toBe(school.id);
  });

  it('does not leave partial user or profile updates when create/update fails', async () => {
    const admin = await adminCookie();
    const school = await createSchool(admin, 'Atomicity school');
    const section = await createSection(admin, school.id);
    const emailOwner = await createTeacher(
      admin,
      school.id,
      'Atomic Email Owner',
      'atomic-owner@example.com',
    );
    const target = await createTeacher(
      admin,
      school.id,
      'Atomic Update Target',
      'atomic-target@example.com',
    );
    const failedCreateName = `Duplicate email create ${randomUUID().slice(0, 8)}`;
    assertStatus(
      await api.send('POST', '/api/v1/users/teachers', {
        cookie: admin,
        body: {
          schoolId: school.id,
          name: failedCreateName,
          email: 'atomic-owner@example.com',
          password: 'Temporary invariant password 2026!',
        },
      }),
      409,
      'CONFLICT',
    );
    const failedCreateSearch = await api.send('GET', '/api/v1/users', {
      cookie: admin,
      query: { q: failedCreateName },
    });
    expect(failedCreateSearch.body.items).toEqual([]);

    assertStatus(
      await api.send('PATCH', `/api/v1/users/${target.id}`, {
        cookie: admin,
        body: { email: emailOwner.email, primaryAssignment: 'Must roll back' },
      }),
      409,
      'CONFLICT',
    );
    const afterFailure = await api.send('GET', `/api/v1/users/${target.id}`, { cookie: admin });
    expect(afterFailure.body).toMatchObject({
      email: 'atomic-target@example.com',
      profile: { primaryAssignment: null },
    });

    const student = await createStudent(admin, school.id, section.id);
    const originalProfile = await api.prisma.studentProfile.findUniqueOrThrow({
      where: { userId: student.id },
      select: { guardianName: true, classSectionId: true },
    });
    assertStatus(
      await api.send('PATCH', `/api/v1/users/${student.id}`, {
        cookie: admin,
        body: {
          classSectionId: randomUUID(),
          guardianName: 'Must not partially update',
        },
      }),
      404,
      'NOT_FOUND',
    );
    await expect(
      api.prisma.studentProfile.findUniqueOrThrow({
        where: { userId: student.id },
        select: { guardianName: true, classSectionId: true },
      }),
    ).resolves.toEqual(originalProfile);
  });

  it('bounds user, school, and section pagination and returns empty items beyond each result set', async () => {
    const admin = await adminCookie();
    for (const [path, query] of [
      ['/api/v1/users', { page: 100000, limit: 100 }],
      ['/api/v1/schools', { page: 100000, limit: 100 }],
      ['/api/v1/class-sections', { page: 100000, limit: 100 }],
    ] as const) {
      const response = await api.send('GET', path, {
        cookie: admin,
        query: { ...query, q: `unmatched-${randomUUID()}` },
      });
      assertStatus(response, 200);
      expect(response.body).toMatchObject({ page: 100000, limit: 100, items: [] });
      assertStatus(
        await api.send('GET', path, {
          cookie: admin,
          query: { q: `unmatched-${randomUUID()}`, limit: 101 },
        }),
        400,
        'VALIDATION_ERROR',
      );
      assertStatus(
        await api.send('GET', path, {
          cookie: admin,
          query: { q: `unmatched-${randomUUID()}`, page: 100001 },
        }),
        400,
        'VALIDATION_ERROR',
      );
    }

    expectAssetRoutesAreEnumerated(api.routes);
    const assetsPath = '/api/v1/assets';
    const search = `unmatched-${randomUUID()}`;
    const assets = await api.send('GET', assetsPath, {
      cookie: admin,
      query: { page: 100000, limit: 100, search },
    });
    assertStatus(assets, 200);
    expect(assets.body).toMatchObject({ page: 100000, limit: 100, items: [] });
    assertStatus(
      await api.send('GET', assetsPath, {
        cookie: admin,
        query: { search, limit: 101 },
      }),
      400,
      'VALIDATION_ERROR',
    );
    assertStatus(
      await api.send('GET', assetsPath, {
        cookie: admin,
        query: { search, page: 100001 },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });
});

function expectAssetRoutesAreEnumerated(routes: ApiRoute[]): void {
  const expected = [
    'GET /api/v1/assets',
    'GET /api/v1/assets/:id',
    'GET /api/v1/assets/:id/access',
    'POST /api/v1/assets',
    'PATCH /api/v1/assets/:id/status',
    'PATCH /api/v1/assets/:id',
    'DELETE /api/v1/assets/:id',
    'POST /api/v1/assets/:id/files',
    'GET /api/v1/assets/:id/files/:fileId',
    'POST /api/v1/assets/:id/files/:fileId/complete',
  ];
  const actual = new Set(
    routes.filter((route) => route.path.startsWith('/api/v1/assets')).map(routeKey),
  );
  expect([...actual].sort()).toEqual(expected.sort());
}

function routeKey(route: ApiRoute): string {
  return `${route.method} ${route.path}`;
}

function concretePath(route: ApiRoute): string {
  return route.path.replace(/:[A-Za-z0-9_]+/g, () => randomUUID()).replace(/\*[\w]+/g, 'live');
}

function isPublicRoute(route: ApiRoute): boolean {
  return route.path === '/api/v1/auth/login' || route.path.startsWith('/health/');
}

function isBackendRoute(route: ApiRoute): boolean {
  return route.path.startsWith('/api/v1/') || route.path.startsWith('/health/');
}

function isSessionOnlyRoute(route: ApiRoute): boolean {
  return ['/api/v1/auth/me', '/api/v1/auth/logout', '/api/v1/auth/change-password'].includes(
    route.path,
  );
}

function cookieFrom(response: { headers: Record<string, string | string[] | undefined> }): string {
  const cookie = response.headers['set-cookie'];
  const first = Array.isArray(cookie) ? cookie[0] : cookie;
  if (!first) {
    throw new Error('Expected password change to refresh the session cookie.');
  }
  return first.split(';', 1)[0]!;
}
