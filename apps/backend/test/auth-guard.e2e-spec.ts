import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import type { App } from 'supertest/types.js';
import { SchoolStatus, UserStatus, UserType } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { AllowWhenPasswordChangeRequired } from '../src/auth/decorators/allow-when-password-change-required.decorator.js';
import { CurrentAuth } from '../src/auth/decorators/current-auth.decorator.js';
import { Public } from '../src/auth/decorators/public.decorator.js';
import type { AuthContext } from '../src/auth/types/auth-context.js';
import { TokenService } from '../src/auth/services/token.service.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const TEST_PASSWORD_HASH = 'test-only-password-hash';
const ALTERNATE_TEST_SECRET = 'different-test-secret-that-is-at-least-32-characters';

@Controller('test-auth')
class AuthGuardTestController {
  @Get('context')
  getContext(@CurrentAuth() auth: AuthContext | undefined): AuthContext | undefined {
    return auth;
  }

  @AllowWhenPasswordChangeRequired()
  @Get('password-change')
  getPasswordChange(): { allowed: true } {
    return { allowed: true };
  }

  @Public()
  @Get('public')
  getPublic(): { public: true } {
    return { public: true };
  }
}

@Module({
  imports: [AppModule],
  controllers: [AuthGuardTestController],
})
class AuthGuardTestModule {}

describe('Global authentication guard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokens: TokenService;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AuthGuardTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.teacherProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    if (createdSchoolIds.length > 0) {
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      createdSchoolIds.length = 0;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(
    userType: UserType = UserType.PLATFORM_STAFF,
    schoolStatus: SchoolStatus = SchoolStatus.ACTIVE,
    mustChangePassword = false,
  ): Promise<{ id: string; schoolId: string | null }> {
    const schoolCode = `AT${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const roleKey = userType === UserType.PLATFORM_STAFF ? 'admin' : 'teacher';
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
      select: { id: true },
    });

    const fixture = await prisma.$transaction(async (tx) => {
      const school =
        userType === UserType.PLATFORM_STAFF
          ? null
          : await tx.school.create({
              data: {
                code: schoolCode,
                name: 'Auth Guard Test School',
                city: 'Test City',
                state: 'Test State',
                postalCode: '00000',
                country: 'Test Country',
                status: schoolStatus,
              },
              select: { id: true },
            });
      const user = await tx.user.create({
        data: {
          steamxId: `AUTH${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
          name: 'Auth Guard Test User',
          passwordHash: TEST_PASSWORD_HASH,
          roleId: role.id,
          userType,
          schoolId: school?.id ?? null,
          mustChangePassword,
        },
        select: { id: true },
      });

      if (school) {
        await tx.teacherProfile.create({
          data: { userId: user.id, schoolId: school.id },
        });
      }

      return { userId: user.id, schoolId: school?.id ?? null };
    });

    createdUserIds.push(fixture.userId);
    if (fixture.schoolId !== null) {
      createdSchoolIds.push(fixture.schoolId);
    }
    return { id: fixture.userId, schoolId: fixture.schoolId };
  }

  function withCookie(token: string) {
    return request(app.getHttpServer())
      .get('/api/v1/test-auth/context')
      .set('Cookie', `${tokens.cookieOptions().name}=${token}`);
  }

  async function expectUnauthorized(response: SupertestResponse): Promise<void> {
    expect(response.status).toBe(401);
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'requestId',
      'statusCode',
    ]);
    expect(response.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired authentication token',
      requestId: expect.any(String),
    });
  }

  it('returns the same generic response for missing, malformed, invalid-signature, and expired tokens', async () => {
    const user = await createUser();
    const alternateToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(ALTERNATE_TEST_SECRET));

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() - tokens.cookieOptions().maxAge - 1_000);
    const expiredToken = await tokens.sign(user.id);
    vi.useRealTimers();

    const responses = [
      await request(app.getHttpServer()).get('/api/v1/test-auth/context'),
      await withCookie('not-a-token'),
      await withCookie(alternateToken),
      await withCookie(expiredToken),
    ];

    for (const response of responses) {
      await expectUnauthorized(response);
    }
    expect(responses.map(({ body }) => Object.keys(body).sort())).toEqual(
      responses.map(() => ['code', 'message', 'requestId', 'statusCode']),
    );
    expect(new Set(responses.map(({ body }) => body.message)).size).toBe(1);
  });

  it('loads the current auth context from the database', async () => {
    const user = await createUser(UserType.SCHOOL_STAFF);
    const token = await tokens.sign(user.id);

    const response = await withCookie(token).expect(200);

    expect(response.body).toEqual({
      userId: user.id,
      steamxId: expect.stringMatching(/^AUTH[A-F0-9]{8}$/),
      name: 'Auth Guard Test User',
      roleKey: 'teacher',
      userType: UserType.SCHOOL_STAFF,
      schoolId: user.schoolId,
      mustChangePassword: false,
    });
  });

  it('rejects a user deactivated after the token was issued', async () => {
    const user = await createUser();
    const token = await tokens.sign(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.INACTIVE } });

    await expectUnauthorized(await withCookie(token));
  });

  it('rejects a school deactivated after the token was issued', async () => {
    const user = await createUser(UserType.SCHOOL_STAFF);
    const token = await tokens.sign(user.id);
    if (user.schoolId === null) {
      throw new Error('The school staff test user should have a school.');
    }
    await prisma.school.update({
      where: { id: user.schoolId },
      data: { status: SchoolStatus.INACTIVE },
    });

    await expectUnauthorized(await withCookie(token));
  });

  it('allows active platform staff without a school', async () => {
    const user = await createUser();
    const token = await tokens.sign(user.id);

    const response = await withCookie(token).expect(200);

    expect(response.body).toMatchObject({ userId: user.id, schoolId: null, roleKey: 'admin' });
  });

  it('rejects tokens issued before a password change but accepts the same whole second', async () => {
    const changedUser = await createUser();
    const staleToken = await tokens.sign(changedUser.id);
    const staleClaims = await tokens.verify(staleToken);
    await prisma.user.update({
      where: { id: changedUser.id },
      data: { passwordChangedAt: new Date((staleClaims.issuedAt + 1) * 1_000) },
    });
    await expectUnauthorized(await withCookie(staleToken));

    const sameSecondUser = await createUser();
    const sameSecondToken = await tokens.sign(sameSecondUser.id);
    const sameSecondClaims = await tokens.verify(sameSecondToken);
    await prisma.user.update({
      where: { id: sameSecondUser.id },
      data: { passwordChangedAt: new Date(sameSecondClaims.issuedAt * 1_000) },
    });

    await withCookie(sameSecondToken).expect(200);
  });

  it('rejects a valid token for an unknown user id', async () => {
    const token = await tokens.sign(randomUUID());

    await expectUnauthorized(await withCookie(token));
  });

  it('requires password change except on an explicitly allowed route', async () => {
    const user = await createUser(UserType.PLATFORM_STAFF, SchoolStatus.ACTIVE, true);
    const token = await tokens.sign(user.id);

    const blocked = await withCookie(token).expect(403);
    expect(blocked.body).toMatchObject({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Password change required',
    });

    await request(app.getHttpServer())
      .get('/api/v1/test-auth/password-change')
      .set('Cookie', `${tokens.cookieOptions().name}=${token}`)
      .expect(200)
      .expect({ allowed: true });
  });

  it('allows public test and health routes without a cookie', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/test-auth/public')
      .expect(200)
      .expect({ public: true });
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });
  });
});
