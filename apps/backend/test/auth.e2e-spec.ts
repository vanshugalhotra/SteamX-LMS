import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import type { App } from 'supertest/types.js';
import { SchoolStatus, UserStatus, UserType } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { AuthContextRepository } from '../src/auth/auth-context.repository.js';
import { CurrentAuth } from '../src/auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../src/auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../src/auth/permissions.js';
import type { AuthContext } from '../src/auth/types/auth-context.js';
import { PasswordService } from '../src/auth/services/password.service.js';
import { TokenService } from '../src/auth/services/token.service.js';
import { configureApp } from '../src/configure-app.js';
import type { Env } from '../src/config/env.schema.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TEST_PASSWORD = 'Test login password 2026!';

@Controller('auth-test')
class AuthTestController {
  @Get('protected')
  getProtected(@CurrentAuth() authContext: AuthContext): AuthContext {
    return authContext;
  }

  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Get('password-reset-permission')
  getPasswordResetPermission(): { allowed: true } {
    return { allowed: true };
  }
}

@Module({
  imports: [AppModule],
  controllers: [AuthTestController],
})
class AuthTestModule {}

describe('Authentication endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let tokens: TokenService;
  let origin: string;
  let passwordHash: string;
  let rolePermissionsLoader: ReturnType<typeof vi.spyOn>;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdClassSectionIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AuthTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    rolePermissionsLoader = vi.spyOn(app.get(AuthContextRepository), 'findRolePermissions');
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    tokens = app.get(TokenService);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    const configuredOrigin = config.get('CORS_ORIGINS', { infer: true })[0];
    if (!configuredOrigin) {
      throw new Error('AUTH E2E tests require at least one CORS_ORIGINS entry.');
    }
    origin = configuredOrigin;
    passwordHash = await passwords.hash(TEST_PASSWORD);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await app.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (createdUserIds.length > 0) {
      await prisma.teacherProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.studentProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    if (createdClassSectionIds.length > 0) {
      await prisma.classSection.deleteMany({ where: { id: { in: createdClassSectionIds } } });
      createdClassSectionIds.length = 0;
    }
    if (createdSchoolIds.length > 0) {
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      createdSchoolIds.length = 0;
    }
  }

  async function createUser(
    options: {
      userType?: UserType;
      status?: UserStatus;
      schoolStatus?: SchoolStatus;
      mustChangePassword?: boolean;
      steamxId?: string;
    } = {},
  ): Promise<{ id: string; steamxId: string; schoolId: string | null }> {
    const userType = options.userType ?? UserType.PLATFORM_STAFF;
    const roleKey =
      userType === UserType.PLATFORM_STAFF
        ? 'admin'
        : userType === UserType.STUDENT
          ? 'student'
          : 'teacher';
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
      select: { id: true },
    });
    const schoolCode = `AT${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const steamxId =
      options.steamxId ?? `AUTH${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const fixture = await prisma.$transaction(async (tx) => {
      const school =
        userType === UserType.PLATFORM_STAFF
          ? null
          : await tx.school.create({
              data: {
                code: schoolCode,
                name: 'Auth E2E School',
                city: 'Test City',
                state: 'Test State',
                postalCode: '00000',
                country: 'Test Country',
                status: options.schoolStatus ?? SchoolStatus.ACTIVE,
              },
              select: { id: true },
            });
      const classSection =
        userType === UserType.STUDENT && school
          ? await tx.classSection.create({
              data: {
                schoolId: school.id,
                className: `Class ${randomUUID().slice(0, 8)}`,
              },
              select: { id: true },
            })
          : null;
      const user = await tx.user.create({
        data: {
          steamxId,
          name: 'Auth E2E User',
          passwordHash,
          roleId: role.id,
          userType,
          schoolId: school?.id ?? null,
          status: options.status ?? UserStatus.ACTIVE,
          mustChangePassword: options.mustChangePassword ?? false,
        },
        select: { id: true },
      });

      if (school) {
        if (userType === UserType.STUDENT && classSection) {
          await tx.studentProfile.create({
            data: {
              userId: user.id,
              schoolId: school.id,
              classSectionId: classSection.id,
            },
          });
        } else {
          await tx.teacherProfile.create({
            data: { userId: user.id, schoolId: school.id },
          });
        }
      }

      return {
        id: user.id,
        schoolId: school?.id ?? null,
        classSectionId: classSection?.id ?? null,
      };
    });
    createdUserIds.push(fixture.id);
    if (fixture.schoolId !== null) {
      createdSchoolIds.push(fixture.schoolId);
    }
    if (fixture.classSectionId !== null) {
      createdClassSectionIds.push(fixture.classSectionId);
    }
    return { ...fixture, steamxId };
  }

  function login(steamxId: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ steamxId, password });
  }

  function postWithSession(path: string, cookie: string, body: object) {
    return request(app.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function withCookie(path: string, cookie: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookie);
  }

  function getCookie(response: SupertestResponse): string {
    const setCookie = response.headers['set-cookie'];
    if (!setCookie || setCookie.length === 0) {
      throw new Error('Login response did not set a session cookie.');
    }
    return setCookie[0]!.split(';', 1)[0]!;
  }

  it('logs in, sets an HTTP-only cookie, and uses it to fetch /auth/me', async () => {
    const user = await createUser();
    const response = await login(user.steamxId, TEST_PASSWORD).expect(200);

    expect(response.body).toEqual({
      id: user.id,
      steamxId: user.steamxId,
      name: 'Auth E2E User',
      roleKey: 'admin',
      userType: UserType.PLATFORM_STAFF,
      schoolId: null,
      mustChangePassword: false,
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');
    const setCookie = response.headers['set-cookie']?.[0];
    expect(setCookie).toMatch(/^steamx_session=[^;]+;/);
    expect(setCookie).toMatch(new RegExp(`; Max-Age=${tokens.cookieOptions().maxAge / 1_000};`));
    expect(setCookie).toMatch(/; Expires=/i);
    expect(setCookie).toMatch(/; Path=\//i);
    expect(setCookie).toMatch(/; HttpOnly/i);
    expect(setCookie).toMatch(/; SameSite=Lax/i);
    if (tokens.cookieOptions().secure) {
      expect(setCookie).toMatch(/; Secure/i);
    } else {
      expect(setCookie).not.toMatch(/; Secure/i);
    }

    const cookie = getCookie(response);
    const me = await withCookie('/api/v1/auth/me', cookie).expect(200);
    expect(me.body).toEqual(response.body);
    expect(me.headers['cache-control']).toBe('no-store');
  });

  it('normalizes a padded lowercase SteamX ID and supports platform staff without a school', async () => {
    const user = await createUser({ steamxId: `AUTH${randomUUID().slice(0, 8).toUpperCase()}` });

    const response = await login(`  ${user.steamxId.toLowerCase()}  `, TEST_PASSWORD).expect(200);

    expect(response.body.id).toBe(user.id);
    expect(response.body.schoolId).toBeNull();
  });

  it('returns the same generic response for unknown ID, wrong password, inactive user and school', async () => {
    const activeUser = await createUser();
    const inactiveUser = await createUser({ status: UserStatus.INACTIVE });
    const inactiveSchoolUser = await createUser({
      userType: UserType.SCHOOL_STAFF,
      schoolStatus: SchoolStatus.INACTIVE,
    });
    const responses = [
      await login(`UNKNOWN${randomUUID().slice(0, 8)}`, TEST_PASSWORD),
      await login(activeUser.steamxId, 'incorrect password'),
      await login(inactiveUser.steamxId, TEST_PASSWORD),
      await login(inactiveSchoolUser.steamxId, TEST_PASSWORD),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
    expect(
      responses.map(({ body }) => ({
        statusCode: body.statusCode,
        code: body.code,
        message: body.message,
      })),
    ).toEqual(
      responses.map(() => ({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token',
      })),
    );
  });

  it('keeps login, /auth/me and logout available when password change is required', async () => {
    const user = await createUser({ mustChangePassword: true });
    const loginResponse = await login(user.steamxId, TEST_PASSWORD).expect(200);
    expect(loginResponse.body.mustChangePassword).toBe(true);
    const cookie = getCookie(loginResponse);

    await withCookie('/api/v1/auth/me', cookie).expect(200);
    await withCookie('/api/v1/auth-test/protected', cookie).expect(403);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(204);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/^steamx_session=;/);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/; Path=\//i);
    expect(logout.headers['set-cookie']?.[0]).toMatch(/Expires=Thu, 01 Jan 1970/i);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('loads role permissions once and only allows the seeded Admin permission', async () => {
    const admin = await createUser();
    const teacher = await createUser({ userType: UserType.SCHOOL_STAFF });
    const student = await createUser({ userType: UserType.STUDENT });
    const adminCookie = getCookie(await login(admin.steamxId, TEST_PASSWORD).expect(200));
    const teacherCookie = getCookie(await login(teacher.steamxId, TEST_PASSWORD).expect(200));
    const studentCookie = getCookie(await login(student.steamxId, TEST_PASSWORD).expect(200));

    expect(rolePermissionsLoader).toHaveBeenCalledTimes(1);
    await withCookie('/api/v1/auth-test/password-reset-permission', adminCookie).expect(200);
    await withCookie('/api/v1/auth-test/password-reset-permission', teacherCookie).expect(403);
    await withCookie('/api/v1/auth-test/password-reset-permission', studentCookie).expect(403);
    await withCookie('/api/v1/auth-test/protected', teacherCookie).expect(200);
    expect(rolePermissionsLoader).toHaveBeenCalledTimes(1);
  });

  it('changes passwords, invalidates an older token, and permits a required password change', async () => {
    const user = await createUser({ mustChangePassword: true });
    const loginResponse = await login(user.steamxId, TEST_PASSWORD).expect(200);
    const oldCookie = getCookie(loginResponse);
    const passwordBefore = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordChangedAt: true },
    });
    const currentTime = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(currentTime - 5_000);
    const oldToken = await tokens.sign(user.id);
    vi.useRealTimers();

    const currentPasswordError = await postWithSession('/api/v1/auth/change-password', oldCookie, {
      currentPassword: 'incorrect current password',
      newPassword: 'Fresh change password 2026!',
    }).expect(400);
    expect(currentPasswordError.body.code).toBe('INVALID_CURRENT_PASSWORD');
    const policyError = await postWithSession('/api/v1/auth/change-password', oldCookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'password123',
    }).expect(400);
    expect(policyError.body.code).toBe('PASSWORD_POLICY');
    expect(policyError.body.details).toContain('PASSWORD_COMMON');
    const reusedError = await postWithSession('/api/v1/auth/change-password', oldCookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: TEST_PASSWORD,
    }).expect(400);
    expect(reusedError.body.code).toBe('PASSWORD_REUSED');

    const changed = await postWithSession('/api/v1/auth/change-password', oldCookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'Fresh change password 2026!',
    }).expect(200);
    expect(changed.body).toMatchObject({
      id: user.id,
      mustChangePassword: false,
    });
    expect(changed.headers['cache-control']).toBe('no-store');
    expect(changed.headers['set-cookie']?.[0]).toMatch(/^steamx_session=[^;]+;/);
    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { mustChangePassword: true, passwordChangedAt: true },
    });
    expect(updatedUser.mustChangePassword).toBe(false);
    expect(updatedUser.passwordChangedAt.getTime()).toBeGreaterThan(
      passwordBefore.passwordChangedAt.getTime(),
    );

    await withCookie('/api/v1/auth-test/protected', `steamx_session=${oldToken}`).expect(401);
    const freshCookie = getCookie(changed);
    await withCookie('/api/v1/auth/me', freshCookie).expect(200);
    await login(user.steamxId, 'Fresh change password 2026!').expect(200);
    await login(user.steamxId, TEST_PASSWORD).expect(401);
  });

  it.each([UserType.SCHOOL_STAFF, UserType.STUDENT])(
    'allows %s users to change their password',
    async (userType) => {
      const user = await createUser({ userType, mustChangePassword: true });
      const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

      const response = await postWithSession('/api/v1/auth/change-password', cookie, {
        currentPassword: TEST_PASSWORD,
        newPassword: 'Fresh change password 2026!',
      }).expect(200);

      expect(response.body.mustChangePassword).toBe(false);
    },
  );

  it('resets passwords only for callers with permission and requires a new password at next login', async () => {
    const admin = await createUser();
    const teacher = await createUser({ userType: UserType.SCHOOL_STAFF });
    const student = await createUser({ userType: UserType.STUDENT });
    const target = await createUser();
    const adminCookie = getCookie(await login(admin.steamxId, TEST_PASSWORD).expect(200));
    const chosenPassword = 'Admin chosen password 2026!';
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - 5_000);
    const targetOldToken = await tokens.sign(target.id);
    vi.useRealTimers();
    const targetOldCookie = `steamx_session=${targetOldToken}`;

    const invalidPolicy = await postWithSession(
      `/api/v1/users/${target.id}/reset-password`,
      adminCookie,
      { newPassword: `prefix-${target.steamxId}-suffix` },
    ).expect(400);
    expect(invalidPolicy.body.code).toBe('PASSWORD_POLICY');
    expect(invalidPolicy.body.details).toContain('PASSWORD_CONTAINS_STEAMX_ID');

    const reset = await postWithSession(`/api/v1/users/${target.id}/reset-password`, adminCookie, {
      newPassword: chosenPassword,
    }).expect(204);
    expect(reset.text).toBe('');
    await withCookie('/api/v1/auth-test/protected', targetOldCookie).expect(401);
    const targetLogin = await login(target.steamxId, chosenPassword).expect(200);
    expect(targetLogin.body.mustChangePassword).toBe(true);
    await login(target.steamxId, TEST_PASSWORD).expect(401);

    const teacherCookie = getCookie(await login(teacher.steamxId, TEST_PASSWORD).expect(200));
    const studentCookie = getCookie(await login(student.steamxId, TEST_PASSWORD).expect(200));
    await postWithSession(`/api/v1/users/${target.id}/reset-password`, teacherCookie, {
      newPassword: chosenPassword,
    }).expect(403);
    await postWithSession(`/api/v1/users/${target.id}/reset-password`, studentCookie, {
      newPassword: chosenPassword,
    }).expect(403);
    await postWithSession(`/api/v1/users/${randomUUID()}/reset-password`, adminCookie, {
      newPassword: chosenPassword,
    }).expect(404);
    await postWithSession(`/api/v1/users/${admin.id}/reset-password`, adminCookie, {
      newPassword: chosenPassword,
    }).expect(400);
  });

  it.each([
    ['missing Origin', undefined],
    ['foreign Origin', 'https://foreign.example'],
    ['null Origin', 'null'],
    ['malformed Origin', 'http://['],
  ])('rejects login with %s using the unified error response', async (_case, requestOrigin) => {
    const builder = request(app.getHttpServer()).post('/api/v1/auth/login');
    if (requestOrigin !== undefined) {
      builder.set('Origin', requestOrigin);
    }
    const response = await builder
      .send({ steamxId: 'AUTH123', password: TEST_PASSWORD })
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origin not allowed',
      requestId: response.headers['x-request-id'],
    });
  });

  it('rejects a forged logout Origin before checking its session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://foreign.example')
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origin not allowed',
    });
  });

  it('does not require Origin for GET requests', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('returns unified validation errors for invalid login bodies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ steamxId: '', password: '' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'steamxId' }),
        expect.objectContaining({ field: 'password' }),
      ]),
    );
  });
});
