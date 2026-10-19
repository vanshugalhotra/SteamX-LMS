import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchoolStatus, UserStatus, UserType } from '../../generated/prisma/client.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { ALLOW_PASSWORD_CHANGE_ROUTE } from '../decorators/metadata.constants.js';
import { AuthContextRepository } from '../auth-context.repository.js';
import type { AuthContext } from '../types/auth-context.js';
import { TokenService } from '../services/token.service.js';
import { AuthGuard } from './auth.guard.js';

const ACTIVE_USER = {
  id: 'user-1',
  steamxId: 'TEACHER1',
  name: 'Teacher',
  status: UserStatus.ACTIVE,
  userType: UserType.SCHOOL_STAFF,
  schoolId: 'school-1',
  mustChangePassword: false,
  passwordChangedAt: new Date('2026-10-19T12:00:00.000Z'),
  role: { key: 'teacher' },
  school: { status: SchoolStatus.ACTIVE },
};

describe('AuthGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Missing cookies and malformed/expired sessions all have the same public 401 response.
  it.each([
    { name: 'missing cookie', token: undefined },
    { name: 'invalid token', token: 'bad-token' },
    { name: 'expired token', token: 'expired-token' },
    { name: 'tampered token', token: 'tampered-token' },
  ])('rejects a request with a $name', async ({ token }) => {
    const verify = vi.fn().mockRejectedValue(new Error('private token detail'));
    const { guard, context, logger } = createGuard(
      {
        cookies: token === undefined ? {} : { steamx_session: token },
      },
      { verify },
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: token === undefined ? 'missing_cookie' : 'invalid_token' }),
      'Authentication failed',
    );
  });

  // Every request rechecks account and school state rather than trusting an unexpired token.
  it.each([
    {
      name: 'a deleted account',
      user: null,
      reason: 'user_not_found',
    },
    {
      name: 'an inactive account',
      user: { ...ACTIVE_USER, status: UserStatus.INACTIVE },
      reason: 'user_inactive',
    },
    {
      name: 'an inactive school',
      user: { ...ACTIVE_USER, school: { status: SchoolStatus.INACTIVE } },
      reason: 'school_inactive',
    },
  ])('rejects a request for $name', async ({ user, reason }) => {
    const { guard, context, logger } = createGuard(
      {},
      {
        user: user as typeof ACTIVE_USER | null,
      },
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason }),
      'Authentication failed',
    );
  });

  // Tokens issued before the account's password timestamp are revoked immediately.
  it('rejects a session issued before password_changed_at', async () => {
    const { guard, context } = createGuard(
      {},
      {
        user: { ...ACTIVE_USER, passwordChangedAt: new Date('2026-10-19T12:00:02.000Z') },
        issuedAt: Date.parse('2026-10-19T12:00:01.000Z') / 1_000,
      },
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: API_ERROR.AUTHENTICATION_FAILED,
    });
  });

  // A valid session attaches only current database identity to the request.
  it('attaches the active account identity to the request', async () => {
    const request: Record<string, unknown> = { cookies: { steamx_session: 'valid-token' } };
    const { guard, context } = createGuard(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authContext).toEqual<AuthContext>({
      userId: 'user-1',
      steamxId: 'TEACHER1',
      name: 'Teacher',
      roleKey: 'teacher',
      userType: UserType.SCHOOL_STAFF,
      schoolId: 'school-1',
      mustChangePassword: false,
    });
  });

  // Initial/reset passwords may proceed only to explicitly allowed password-change routes.
  it('blocks accounts requiring a password change on ordinary routes', async () => {
    const { guard, context } = createGuard(
      {},
      {
        user: { ...ACTIVE_USER, mustChangePassword: true },
      },
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // A route marked for password changes still requires a valid active session.
  it('allows an authenticated password-change route', async () => {
    const { guard, context } = createGuard(
      {},
      {
        user: { ...ACTIVE_USER, mustChangePassword: true },
        metadata: { [ALLOW_PASSWORD_CHANGE_ROUTE]: true },
      },
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

function createGuard(
  request: Record<string, unknown> = { cookies: { steamx_session: 'valid-token' } },
  options: {
    verify?: ReturnType<typeof vi.fn>;
    user?: typeof ACTIVE_USER | null;
    issuedAt?: number;
    metadata?: Record<string, unknown>;
  } = {},
) {
  if (!('cookies' in request)) {
    request.cookies = { steamx_session: 'valid-token' };
  }
  const handler = vi.fn();
  const metadata = options.metadata ?? {};
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const tokens = {
    cookieOptions: () => ({ name: 'steamx_session' }),
    verify:
      options.verify ??
      vi.fn().mockResolvedValue({
        userId: 'user-1',
        issuedAt: options.issuedAt ?? 1_797_110_400,
      }),
  } as unknown as TokenService;
  const users = {
    findAuthUser: vi
      .fn()
      .mockResolvedValue(options.user === undefined ? ACTIVE_USER : options.user),
  } as unknown as AuthContextRepository;
  const logger = { assign: vi.fn(), warn: vi.fn() };
  return {
    guard: new AuthGuard(reflector, tokens, users, logger as never),
    context: new ExecutionContextHost([request, undefined, undefined], class {}, handler),
    logger,
  };
}
