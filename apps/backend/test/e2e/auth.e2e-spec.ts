import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import type { App } from 'supertest/types.js';
import { SchoolStatus, UserStatus, UserType } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { AuthenticatedOnly } from '../../src/auth/decorators/authenticated-only.decorator.js';
import { CurrentAuth } from '../../src/auth/decorators/current-auth.decorator.js';
import type { AuthContext } from '../../src/auth/types/auth-context.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import { TokenService } from '../../src/auth/services/token.service.js';
import type { Env } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestUser } from '../support/factories/fixtures.js';
import { createTestApp } from '../support/create-test-app.js';
import { cleanupFixtures } from '../support/setup/cleanup.js';
import { expectError } from '../support/expect-error.js';

const TEST_PASSWORD = 'Test login password 2026!';

@Controller('auth-test')
class AuthTestController {
  @AuthenticatedOnly()
  @Get('protected')
  getProtected(@CurrentAuth() authContext: AuthContext): AuthContext {
    return authContext;
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
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdClassSectionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp(AuthTestModule);
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
    vi.useRealTimers();
    await cleanupFixtures(prisma, createdUserIds, createdSchoolIds, createdClassSectionIds);
  });

  afterAll(async () => {
    await app.close();
  });

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
    const steamxId =
      options.steamxId ?? `AUTH${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const fixture = await prisma.$transaction((tx) =>
      createTestUser(tx, {
        userType,
        name: 'Auth E2E User',
        passwordHash,
        steamxId,
        status: options.status,
        schoolStatus: options.schoolStatus,
        mustChangePassword: options.mustChangePassword,
      }),
    );
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

  // A successful login returns a safe profile and a correctly configured session cookie.
  it('sets a secure HTTP-only session cookie on successful login', async () => {
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
    expect(cookie).toMatch(/^steamx_session=[^;]+$/);
  });

  // Login trims whitespace and uppercases the SteamX ID before lookup.
  it('normalizes a padded lowercase SteamX ID', async () => {
    const user = await createUser({ steamxId: `AUTH${randomUUID().slice(0, 8).toUpperCase()}` });

    const response = await login(`  ${user.steamxId.toLowerCase()}  `, TEST_PASSWORD).expect(200);

    expect(response.body.id).toBe(user.id);
  });

  // Platform staff accounts are valid without a school assignment.
  it('logs in platform staff without a school', async () => {
    const user = await createUser();

    const response = await login(user.steamxId, TEST_PASSWORD).expect(200);

    expect(response.body.id).toBe(user.id);
    expect(response.body.schoolId).toBeNull();
  });

  // The current profile endpoint returns the authenticated profile without private credential fields.
  it('returns the current profile for a valid cookie', async () => {
    const user = await createUser();
    const loginResponse = await login(user.steamxId, TEST_PASSWORD).expect(200);

    const response = await withCookie('/api/v1/auth/me', getCookie(loginResponse)).expect(200);

    expect(response.body).toEqual(loginResponse.body);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  // Invalid IDs, passwords, inactive accounts, and inactive schools reveal no account state.
  it('returns the same authentication error for every invalid login state', async () => {
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
      expectError(response, 401, 'AUTHENTICATION_FAILED');
      expect(response.body.message).toBe('Invalid or expired authentication token');
    }
    expect(new Set(responses.map(({ body }) => body.message))).toHaveLength(1);
  });

  // Repeated invalid credentials are consistently rejected; this API currently has no rate limit.
  it('does not return a rate-limit response after repeated login failures', async () => {
    const user = await createUser();

    const responses = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      responses.push(await login(user.steamxId, 'incorrect password'));
    }

    for (const response of responses) {
      expectError(response, 401, 'AUTHENTICATION_FAILED');
    }
  });

  // A forced-change account can log in and its state is included in the safe profile.
  it('reports the forced-password-change state at login', async () => {
    const user = await createUser({ mustChangePassword: true });
    const loginResponse = await login(user.steamxId, TEST_PASSWORD).expect(200);

    expect(loginResponse.body.mustChangePassword).toBe(true);
  });

  // The current-profile route remains available while a password change is required.
  it('allows /auth/me while a password change is required', async () => {
    const user = await createUser({ mustChangePassword: true });
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await withCookie('/api/v1/auth/me', cookie).expect(200);
  });

  // Forced-change accounts cannot access routes outside the explicit auth exceptions.
  it('blocks protected routes while a password change is required', async () => {
    const user = await createUser({ mustChangePassword: true });
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await withCookie('/api/v1/auth-test/protected', cookie).expect(403);

    expectError(response, 403, 'PASSWORD_CHANGE_REQUIRED');
  });

  // Logging out clears the browser cookie even while a password change is required.
  it('allows logout while a password change is required', async () => {
    const user = await createUser({ mustChangePassword: true });
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(204);

    expect(response.headers['set-cookie']?.[0]).toMatch(/^steamx_session=;/);
    expect(response.headers['set-cookie']?.[0]).toMatch(/; Path=\//i);
    expect(response.headers['set-cookie']?.[0]).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  // Logout requires an authenticated cookie and returns the normal authentication error envelope.
  it('rejects logout without a cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .expect(401);

    expectError(response, 401, 'AUTHENTICATION_FAILED');
  });

  // Logout clears only the browser cookie; a copied stateless token remains valid until expiry.
  it('continues to accept a copied token after logout', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(204);

    await withCookie('/api/v1/auth/me', cookie).expect(200);
  });

  // An absent session cannot read the current profile.
  it('rejects /auth/me without a cookie', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    expectError(response, 401, 'AUTHENTICATION_FAILED');
  });

  // Malformed, expired, and tampered sessions are rejected by the real profile endpoint.
  it.each(['malformed', 'expired', 'tampered'])('rejects a %s cookie at /auth/me', async (kind) => {
    const user = await createUser();
    let token = 'not-a-token';
    if (kind === 'expired') {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
      token = await tokens.sign(user.id);
      vi.useRealTimers();
    } else if (kind === 'tampered') {
      const valid = await tokens.sign(user.id);
      const [header, payload, signature] = valid.split('.');
      const replacement = signature?.[0] === 'a' ? 'b' : 'a';
      token = `${header}.${payload}.${replacement}${signature?.slice(1) ?? ''}`;
    }

    const response = await withCookie('/api/v1/auth/me', `steamx_session=${token}`).expect(401);

    expectError(response, 401, 'AUTHENTICATION_FAILED');
  });

  // A GET profile request does not require Origin when a valid session cookie is present.
  it('allows /auth/me with a valid cookie and no Origin header', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await withCookie('/api/v1/auth/me', cookie).expect(200);
  });

  // Origin is not required or enforced for safe GET requests, even when it is foreign.
  it('allows /auth/me with an invalid Origin and a valid cookie', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Origin', 'https://foreign.example')
      .set('Cookie', cookie)
      .expect(200);
  });

  // Deactivated accounts lose access immediately, and reactivation restores the same session.
  it('restores access after an account is reactivated', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.INACTIVE } });

    expectError(await withCookie('/api/v1/auth/me', cookie), 401, 'AUTHENTICATION_FAILED');
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
    await withCookie('/api/v1/auth/me', cookie).expect(200);
  });

  // School deactivation immediately blocks its users; reactivation restores their sessions.
  it('restores access after a school is reactivated', async () => {
    const user = await createUser({ userType: UserType.SCHOOL_STAFF });
    if (!user.schoolId) {
      throw new Error('School staff fixture should have a school.');
    }
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));
    await prisma.school.update({
      where: { id: user.schoolId },
      data: { status: SchoolStatus.INACTIVE },
    });

    expectError(await withCookie('/api/v1/auth/me', cookie), 401, 'AUTHENTICATION_FAILED');
    await prisma.school.update({
      where: { id: user.schoolId },
      data: { status: SchoolStatus.ACTIVE },
    });
    await withCookie('/api/v1/auth/me', cookie).expect(200);
  });

  // A wrong current password is rejected without changing the session or account password.
  it('rejects a password change with the wrong current password', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: 'wrong current password',
      newPassword: 'Fresh change password 2026!',
    }).expect(400);

    expectError(response, 400, 'INVALID_CURRENT_PASSWORD');
  });

  // Reusing the existing password is rejected before the credential is updated.
  it('rejects a new password equal to the current password', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: TEST_PASSWORD,
    }).expect(400);

    expectError(response, 400, 'PASSWORD_REUSED');
  });

  // Password policy rejects whitespace-padded and common values within the DTO's length limits.
  it.each([' leading password 2026!', 'trailing password 2026! ', 'password123'])(
    'rejects a policy-violating password: %s',
    async (newPassword) => {
      const user = await createUser();
      const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

      const response = await postWithSession('/api/v1/auth/change-password', cookie, {
        currentPassword: TEST_PASSWORD,
        newPassword,
      }).expect(400);

      expectError(response, 400, 'PASSWORD_POLICY');
    },
  );

  // Password policy rejects a candidate containing the user's SteamX ID.
  it('rejects a new password containing the SteamX ID', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));
    const response = await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: `Contains-${user.steamxId}-phrase`,
    }).expect(400);

    expectError(response, 400, 'PASSWORD_POLICY');
  });

  // Password changes reject only policy violations with the policy error code and details.
  it('reports the length policy violation for a short new password', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'short7',
    }).expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'PASSWORD_POLICY',
      requestId: expect.any(String),
      details: expect.arrayContaining(['PASSWORD_LENGTH']),
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  // No character-composition rule is imposed when the password otherwise meets policy.
  it('accepts a valid password without digits or special characters', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'plainletters',
    }).expect(200);
  });

  // The maximum policy length is inclusive and remains within the DTO field limit.
  it('accepts a new password at the 100-character boundary', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'a'.repeat(100),
    }).expect(200);
  });

  // Missing, mistyped, and overlong fields fail DTO validation with the standard envelope.
  it.each([
    ['missing current password', { newPassword: 'Fresh change password 2026!' }],
    ['missing new password', { currentPassword: TEST_PASSWORD }],
    [
      'non-string current password',
      { currentPassword: 12, newPassword: 'Fresh change password 2026!' },
    ],
    ['non-string new password', { currentPassword: TEST_PASSWORD, newPassword: 12 }],
    [
      'overlong current password',
      { currentPassword: 'x'.repeat(129), newPassword: 'Fresh change password 2026!' },
    ],
    ['overlong new password', { currentPassword: TEST_PASSWORD, newPassword: 'x'.repeat(101) }],
  ])('validates change-password body with %s', async (_caseName, body) => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await postWithSession('/api/v1/auth/change-password', cookie, body).expect(
      400,
    );

    expectError(response, 400, 'VALIDATION_ERROR');
  });

  // Successful changes clear the forced-change flag and issue a refreshed session cookie.
  it('clears mustChangePassword and refreshes the session after a successful change', async () => {
    const user = await createUser({ mustChangePassword: true });
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'Fresh change password 2026!',
    }).expect(200);

    expect(response.body).toMatchObject({ id: user.id, mustChangePassword: false });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']?.[0]).toMatch(/^steamx_session=[^;]+;/);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { mustChangePassword: true },
      }),
    ).resolves.toEqual({ mustChangePassword: false });
  });

  // Password update invalidates a token issued at least one second before the update.
  it('rejects a token issued before the password change', async () => {
    const user = await createUser();
    const oldCookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));
    const token = oldCookie.split('=', 2)[1]!;
    const claims = await tokens.verify(token);
    vi.useFakeTimers();
    vi.setSystemTime(new Date((claims.issuedAt + 5) * 1_000));

    await postWithSession('/api/v1/auth/change-password', oldCookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'Fresh change password 2026!',
    }).expect(200);
    vi.useRealTimers();

    expectError(await withCookie('/api/v1/auth/me', oldCookie), 401, 'AUTHENTICATION_FAILED');
  });

  // A token issued in the same timestamp second remains valid under the documented guard rule.
  it('accepts a pre-change token issued in the same second as the password update', async () => {
    const user = await createUser();
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordChangedAt: true },
    });
    vi.useFakeTimers();
    vi.setSystemTime(Math.floor(currentUser.passwordChangedAt.getTime() / 1_000) * 1_000);
    const oldToken = await tokens.sign(user.id);
    const oldClaims = await tokens.verify(oldToken);

    const changed = await postWithSession(
      '/api/v1/auth/change-password',
      `steamx_session=${oldToken}`,
      {
        currentPassword: TEST_PASSWORD,
        newPassword: 'Fresh change password 2026!',
      },
    ).expect(200);
    vi.useRealTimers();

    const newToken = getCookie(changed).split('=', 2)[1]!;
    await expect(tokens.verify(newToken)).resolves.toMatchObject({ issuedAt: oldClaims.issuedAt });
    await withCookie('/api/v1/auth/me', `steamx_session=${oldToken}`).expect(200);
  });

  // The new password authenticates successfully and the previous password no longer does.
  it('authenticates with the new password after a successful change', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    await postWithSession('/api/v1/auth/change-password', cookie, {
      currentPassword: TEST_PASSWORD,
      newPassword: 'Fresh change password 2026!',
    }).expect(200);

    await login(user.steamxId, 'Fresh change password 2026!').expect(200);
    expectError(await login(user.steamxId, TEST_PASSWORD), 401, 'AUTHENTICATION_FAILED');
  });

  // State-changing authentication requests require an allowed Origin before processing the cookie.
  it('rejects password change without an allowed Origin', async () => {
    const user = await createUser();
    const cookie = getCookie(await login(user.steamxId, TEST_PASSWORD).expect(200));

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Fresh change password 2026!' })
      .expect(403);

    expectError(response, 403, 'ORIGIN_NOT_ALLOWED');
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

    expectError(response, 403, 'ORIGIN_NOT_ALLOWED');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects a forged logout Origin before checking its session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://foreign.example')
      .expect(403);

    expectError(response, 403, 'ORIGIN_NOT_ALLOWED');
  });

  // Login rejects unknown fields, wrong input types, and overlong SteamX IDs uniformly.
  it.each([
    ['missing SteamX ID', { password: TEST_PASSWORD }],
    ['missing password', { steamxId: 'AUTH123' }],
    ['unknown fields', { steamxId: 'AUTH123', password: TEST_PASSWORD, extra: true }],
    ['wrong field types', { steamxId: 123, password: TEST_PASSWORD }],
    ['SteamX IDs longer than 64 characters', { steamxId: 'A'.repeat(65), password: TEST_PASSWORD }],
    ['empty required fields', { steamxId: '', password: '' }],
  ])('validates login body with %s', async (_caseName, body) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      requestId: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.body).not.toHaveProperty('stack');
  });

  // Trimming makes a whitespace-only SteamX ID invalid.
  it('rejects a whitespace-only SteamX ID after trimming', async () => {
    const response = await login('   ', TEST_PASSWORD).expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      requestId: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  // Password whitespace is not normalized before credential verification.
  it('checks a whitespace-only password as supplied', async () => {
    const user = await createUser();

    expectError(await login(user.steamxId, '        '), 401, 'AUTHENTICATION_FAILED');
  });
});
