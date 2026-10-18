import {
  Controller,
  Get,
  INestApplication,
  Module,
  RequestMethod,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import type { App } from 'supertest/types.js';
import type { Env } from '../../src/config/env.schema.js';
import { SchoolStatus, UserStatus, UserType } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { AUTH_COOKIE_NAME } from '../../src/auth/auth.constants.js';
import { AuthenticatedOnly } from '../../src/auth/decorators/authenticated-only.decorator.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import { RequirePermission } from '../../src/auth/decorators/require-permission.decorator.js';
import { CurrentAuth } from '../../src/auth/decorators/current-auth.decorator.js';
import { PUBLIC_ROUTE } from '../../src/auth/decorators/metadata.constants.js';
import { PERMISSION } from '../../src/auth/permissions.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import { FirstAdminError } from '../../src/auth/types/first-admin.js';
import { runAdminCreate } from '../../src/scripts/admin-create.js';
import { configureApp } from '../../src/configure-app.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestUser } from '../factories/fixtures.js';
import { loginAs } from '../setup/login.js';
import { cleanupFixtures } from '../setup/cleanup.js';

const INITIAL_PASSWORD = 'Starting invariant password 2026!';
const RECOVERY_PASSWORD = 'Recovered admin password 2026!';
const RESET_PASSWORD = 'Admin selected reset password 2026!';
const CHANGED_PASSWORD = 'Changed after reset password 2026!';

@Controller({ path: 'auth-invariants', version: '1' })
class AuthInvariantTestController {
  @AuthenticatedOnly()
  @Get('normal')
  normal(@CurrentAuth() auth: AuthContext): { userId: string } {
    return { userId: auth.userId };
  }

  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Get('permission')
  permission(): { allowed: true } {
    return { allowed: true };
  }
}

@Module({
  imports: [AppModule, DiscoveryModule],
  controllers: [AuthInvariantTestController],
})
class AuthInvariantTestModule {}

type FixtureUser = {
  id: string;
  steamxId: string;
  schoolId: string | null;
  password: string;
};

function strings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function httpMethod(value: unknown): string | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }

  const methods: Partial<Record<RequestMethod, string>> = {
    [RequestMethod.GET]: 'GET',
    [RequestMethod.POST]: 'POST',
    [RequestMethod.PUT]: 'PUT',
    [RequestMethod.PATCH]: 'PATCH',
    [RequestMethod.DELETE]: 'DELETE',
    [RequestMethod.HEAD]: 'HEAD',
    [RequestMethod.OPTIONS]: 'OPTIONS',
  };
  return methods[value as RequestMethod];
}

describe('Authentication invariants (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let origin: string;
  let passwordHash: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdClassSectionIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AuthInvariantTestModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    passwordHash = await passwords.hash(INITIAL_PASSWORD);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    origin = config.get('CORS_ORIGINS', { infer: true })[0] ?? '';
    if (!origin) {
      throw new Error('Auth invariant tests require a configured CORS_ORIGINS entry.');
    }
  });

  afterEach(async () => {
    await cleanupFixtures(prisma, createdUserIds, createdSchoolIds, createdClassSectionIds);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(userType: UserType = UserType.PLATFORM_STAFF): Promise<FixtureUser> {
    const fixture = await prisma.$transaction((tx) =>
      createTestUser(tx, {
        userType,
        name: 'Auth Invariant User',
        passwordHash,
        steamxId: `INV${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        mustChangePassword: false,
      }),
    );

    createdUserIds.push(fixture.id);
    if (fixture.schoolId) {
      createdSchoolIds.push(fixture.schoolId);
    }
    if (fixture.classSectionId) {
      createdClassSectionIds.push(fixture.classSectionId);
    }
    return {
      id: fixture.id,
      schoolId: fixture.schoolId,
      steamxId: fixture.steamxId,
      password: INITIAL_PASSWORD,
    };
  }

  async function login(user: FixtureUser, password = INITIAL_PASSWORD): Promise<string> {
    return loginAs(app, user, password);
  }

  function get(path: string, cookie?: string) {
    const call = request(app.getHttpServer()).get(path);
    return cookie ? call.set('Cookie', cookie) : call;
  }

  function post(
    path: string,
    body: object,
    cookie?: string,
    requestOrigin: string | null = origin,
  ) {
    const call = request(app.getHttpServer()).post(path).send(body);
    if (requestOrigin !== null) {
      call.set('Origin', requestOrigin);
    }
    if (cookie) {
      call.set('Cookie', cookie);
    }
    return call;
  }

  function expectGenericUnauthorized(response: SupertestResponse): void {
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired authentication token',
      requestId: expect.any(String),
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'requestId',
      'statusCode',
    ]);
  }

  async function waitUntilNextSecond(): Promise<void> {
    const issuedSecond = Math.floor(Date.now() / 1_000);
    while (Math.floor(Date.now() / 1_000) === issuedSecond) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
  }

  describe('deactivated user', () => {
    it('accepts the initial session, then rejects both requests and login after deactivation', async () => {
      const user = await createUser();
      const cookie = await login(user);
      await get('/api/v1/auth/me', cookie).expect(200);

      await prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.INACTIVE },
      });
      expectGenericUnauthorized(await get('/api/v1/auth/me', cookie));
      expectGenericUnauthorized(
        await post('/api/v1/auth/login', {
          steamxId: user.steamxId,
          password: INITIAL_PASSWORD,
        }),
      );
    });
  });

  describe('deactivated school', () => {
    it('rejects the teacher session and login while platform staff without a school remains active', async () => {
      const teacher = await createUser(UserType.SCHOOL_STAFF);
      const admin = await createUser();
      const teacherCookie = await login(teacher);
      const adminCookie = await login(admin);
      await get('/api/v1/auth/me', teacherCookie).expect(200);

      if (teacher.schoolId === null) {
        throw new Error('Teacher fixture must have a school.');
      }
      await prisma.school.update({
        where: { id: teacher.schoolId },
        data: { status: SchoolStatus.INACTIVE },
      });

      expectGenericUnauthorized(await get('/api/v1/auth/me', teacherCookie));
      expectGenericUnauthorized(
        await post('/api/v1/auth/login', {
          steamxId: teacher.steamxId,
          password: INITIAL_PASSWORD,
        }),
      );
      await get('/api/v1/auth/me', adminCookie).expect(200);
    });
  });

  describe('admin reset and required password change', () => {
    it('revokes the old session, requires a password update, then restores normal access', async () => {
      const admin = await createUser();
      const teacher = await createUser(UserType.SCHOOL_STAFF);
      const adminCookie = await login(admin);
      const teacherCookie = await login(teacher);

      await waitUntilNextSecond();
      await post(
        `/api/v1/users/${teacher.id}/reset-password`,
        { newPassword: RESET_PASSWORD },
        adminCookie,
      ).expect(204);
      expectGenericUnauthorized(await get('/api/v1/auth/me', teacherCookie));

      const resetCookie = await login(teacher, RESET_PASSWORD);
      const me = await get('/api/v1/auth/me', resetCookie).expect(200);
      expect(me.body.mustChangePassword).toBe(true);
      const blocked = await get('/api/v1/auth-invariants/normal', resetCookie).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      await waitUntilNextSecond();
      const changed = await post(
        '/api/v1/auth/change-password',
        { currentPassword: RESET_PASSWORD, newPassword: CHANGED_PASSWORD },
        resetCookie,
      ).expect(200);
      const freshCookie = changed.headers['set-cookie']?.[0]?.split(';', 1)[0];
      if (!freshCookie) {
        throw new Error('Password change did not refresh the session cookie.');
      }

      expectGenericUnauthorized(await get('/api/v1/auth/me', resetCookie));
      await get('/api/v1/auth-invariants/normal', freshCookie).expect(200);
      expect((await get('/api/v1/auth/me', freshCookie).expect(200)).body.mustChangePassword).toBe(
        false,
      );
    });
  });

  describe('permission denial', () => {
    it('denies teacher and student but permits Admin on reset and the permission test route', async () => {
      const admin = await createUser();
      const teacher = await createUser(UserType.SCHOOL_STAFF);
      const student = await createUser(UserType.STUDENT);
      const target = await createUser();
      const adminCookie = await login(admin);
      const teacherCookie = await login(teacher);
      const studentCookie = await login(student);

      await get('/api/v1/auth-invariants/permission', adminCookie).expect(200);
      await get('/api/v1/auth-invariants/permission', teacherCookie).expect(403);
      await get('/api/v1/auth-invariants/permission', studentCookie).expect(403);

      const resetTarget = (cookie: string) =>
        post(`/api/v1/users/${target.id}/reset-password`, { newPassword: RESET_PASSWORD }, cookie);
      await resetTarget(teacherCookie).expect(403);
      await resetTarget(studentCookie).expect(403);
      await resetTarget(adminCookie).expect(204);
    });
  });

  describe('generic authentication failures', () => {
    it('returns the same 401 shape and message for missing, invalid, inactive, deleted, and stale sessions', async () => {
      const inactiveUser = await createUser();
      const inactiveSchoolUser = await createUser(UserType.SCHOOL_STAFF);
      const deletedUser = await createUser();
      const staleUser = await createUser();
      const inactiveUserCookie = await login(inactiveUser);
      const inactiveSchoolCookie = await login(inactiveSchoolUser);
      const deletedUserCookie = await login(deletedUser);
      const staleUserCookie = await login(staleUser);

      await prisma.user.update({
        where: { id: inactiveUser.id },
        data: { status: UserStatus.INACTIVE },
      });
      if (inactiveSchoolUser.schoolId === null) {
        throw new Error('Teacher fixture must have a school.');
      }
      await prisma.school.update({
        where: { id: inactiveSchoolUser.schoolId },
        data: { status: SchoolStatus.INACTIVE },
      });
      await prisma.user.delete({ where: { id: deletedUser.id } });
      await prisma.user.update({
        where: { id: staleUser.id },
        data: { passwordChangedAt: new Date(Date.now() + 10_000) },
      });

      const responses = [
        await get('/api/v1/auth/me'),
        await get('/api/v1/auth/me', `${AUTH_COOKIE_NAME}=not-a-valid-token`),
        await get('/api/v1/auth/me', inactiveUserCookie),
        await get('/api/v1/auth/me', inactiveSchoolCookie),
        await get('/api/v1/auth/me', deletedUserCookie),
        await get('/api/v1/auth/me', staleUserCookie),
      ];

      for (const response of responses) {
        expectGenericUnauthorized(response);
      }
      expect(
        new Set(responses.map(({ body }) => `${body.statusCode}|${body.code}|${body.message}`))
          .size,
      ).toBe(1);
    });
  });

  describe('public-route allow-list', () => {
    it('contains exactly the intended production public handlers', () => {
      const discovery = app.get(DiscoveryService);
      const reflector = app.get(Reflector);
      const publicRoutes = new Set<string>();

      for (const wrapper of discovery.getControllers()) {
        const controller = wrapper.metatype;
        if (!controller || controller === AuthInvariantTestController) {
          continue;
        }
        const prototype = controller.prototype as Record<string, unknown>;
        const controllerPaths = strings(Reflect.getMetadata(PATH_METADATA, controller));
        const version = Reflect.getMetadata(VERSION_METADATA, controller);
        const isNeutralVersion = version === VERSION_NEUTRAL;
        const versionPath = isNeutralVersion ? '' : `/api/v${strings(version)[0] ?? '1'}`;
        const globalPrefix = isNeutralVersion ? '' : versionPath;

        for (const propertyName of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = prototype[propertyName];
          if (propertyName === 'constructor' || typeof handler !== 'function') {
            continue;
          }
          if (!reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [handler, controller])) {
            continue;
          }

          const method = httpMethod(Reflect.getMetadata(METHOD_METADATA, handler));
          const routePaths = strings(Reflect.getMetadata(PATH_METADATA, handler));
          if (!method) {
            continue;
          }
          for (const controllerPath of controllerPaths) {
            for (const routePath of routePaths) {
              const routePathValue = [controllerPath, routePath].filter(Boolean).join('/');
              publicRoutes.add(`${method} ${globalPrefix}/${routePathValue}`);
            }
          }
        }
      }

      expect([...publicRoutes].sort()).toEqual(
        ['GET /health/live', 'GET /health/ready', 'POST /api/v1/auth/login'].sort(),
      );
    });
  });

  describe('Origin before authentication', () => {
    it.each([null, 'https://foreign.example'])(
      'rejects an unauthenticated state-changing request with Origin %s before auth',
      async (requestOrigin) => {
        const response = await post(
          '/api/v1/auth/change-password',
          { currentPassword: 'irrelevant', newPassword: 'irrelevant' },
          undefined,
          requestOrigin,
        ).expect(403);

        expect(response.body).toMatchObject({
          statusCode: 403,
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Origin not allowed',
        });
      },
    );
  });

  describe('admin:create --reset recovery', () => {
    it('rejects unknown arguments with usage before reading environment or opening the app', async () => {
      await expect(runAdminCreate(['--rest'], {})).rejects.toMatchObject({
        message: 'Usage: pnpm --filter @steamx/backend admin:create [--reset]',
      });
    });

    it('suggests --reset when an admin already exists', async () => {
      const admin = await createUser();

      const output = await runAdminCreate([], {
        ...process.env,
        ADMIN_STEAMX_ID: admin.steamxId,
        ADMIN_PASSWORD: RECOVERY_PASSWORD,
      });

      expect(output).toContain('already exists; no account was created.');
      expect(output).toContain('--reset');
    });

    it('resets only the existing admin credentials and preserves all other user data', async () => {
      const admin = await createUser();
      const oldCookie = await login(admin);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
        select: {
          id: true,
          steamxId: true,
          name: true,
          email: true,
          status: true,
          roleId: true,
          userType: true,
          schoolId: true,
          createdAt: true,
          passwordHash: true,
          mustChangePassword: true,
          passwordChangedAt: true,
        },
      });
      const userCount = await prisma.user.count();
      const schoolCount = await prisma.school.count();

      await waitUntilNextSecond();
      const output = await runAdminCreate(['--reset'], {
        ...process.env,
        ADMIN_STEAMX_ID: ` ${admin.steamxId.toLowerCase()} `,
        ADMIN_PASSWORD: RECOVERY_PASSWORD,
      });

      expect(output).toBe(`password reset for ${admin.steamxId}`);
      expect(output).not.toContain(RECOVERY_PASSWORD);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
        select: {
          id: true,
          steamxId: true,
          name: true,
          email: true,
          status: true,
          roleId: true,
          userType: true,
          schoolId: true,
          createdAt: true,
          passwordHash: true,
          mustChangePassword: true,
          passwordChangedAt: true,
        },
      });
      expect(after).toMatchObject({
        id: before.id,
        steamxId: before.steamxId,
        name: before.name,
        email: before.email,
        status: before.status,
        roleId: before.roleId,
        userType: before.userType,
        schoolId: before.schoolId,
        createdAt: before.createdAt,
        mustChangePassword: true,
      });
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(after.passwordChangedAt.getTime()).toBeGreaterThan(before.passwordChangedAt.getTime());
      expect(await prisma.user.count()).toBe(userCount);
      expect(await prisma.school.count()).toBe(schoolCount);
      expect(await passwords.verify(after.passwordHash, RECOVERY_PASSWORD)).toBe(true);
      expectGenericUnauthorized(await get('/api/v1/auth/me', oldCookie));

      const recoveryLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ steamxId: admin.steamxId, password: RECOVERY_PASSWORD })
        .expect(200);
      expect(recoveryLogin.body.mustChangePassword).toBe(true);
    });

    it('rejects unknown and non-admin IDs without exposing the password', async () => {
      const admin = await createUser();
      const teacher = await createUser(UserType.SCHOOL_STAFF);
      const unknownInput = {
        ...process.env,
        ADMIN_STEAMX_ID: 'UNKNOWN123',
        ADMIN_PASSWORD: RECOVERY_PASSWORD,
      };
      const teacherInput = {
        ...process.env,
        ADMIN_STEAMX_ID: teacher.steamxId,
        ADMIN_PASSWORD: RECOVERY_PASSWORD,
      };
      const invalidPassword = 'password123';
      const invalidPasswordInput = {
        ...process.env,
        ADMIN_STEAMX_ID: admin.steamxId,
        ADMIN_PASSWORD: invalidPassword,
      };

      const errors: unknown[] = [];
      for (const input of [unknownInput, teacherInput, invalidPasswordInput]) {
        try {
          await runAdminCreate(['--reset'], input);
        } catch (error) {
          errors.push(error);
        }
      }

      expect(errors).toHaveLength(3);
      for (const [index, error] of errors.entries()) {
        expect(error).toBeInstanceOf(FirstAdminError);
        if (error instanceof Error) {
          expect(error.message).not.toContain(index === 2 ? invalidPassword : RECOVERY_PASSWORD);
        }
      }
    });
  });
});
