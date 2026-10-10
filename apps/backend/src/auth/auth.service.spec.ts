import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserStatus, UserType } from '../generated/prisma/client.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import type { AuthContext } from './types/auth-context.js';

const LOGIN_PASSWORD = 'sensitive-test-password';
const SESSION_TOKEN = 'sensitive-test-token';

describe('AuthService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does dummy verification for unknown users and logs no credential values', async () => {
    const findLoginUser = vi.fn().mockResolvedValue(null);
    const verify = vi.fn().mockResolvedValue(false);
    const sign = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthContextRepository, useValue: { findLoginUser } },
        { provide: PasswordService, useValue: { verify } },
        { provide: TokenService, useValue: { sign } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);
    const rawSteamxId = 'x'.repeat(70);

    await expect(service.login(rawSteamxId, LOGIN_PASSWORD)).rejects.toThrow(
      'Invalid or expired authentication token',
    );

    expect(findLoginUser).toHaveBeenCalledWith(rawSteamxId.toUpperCase());
    expect(verify).toHaveBeenCalledWith(null, LOGIN_PASSWORD);
    expect(logger.warn).toHaveBeenCalledWith({ steamxId: 'X'.repeat(64) }, 'Login failed');
    const loggedArgs = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(loggedArgs).not.toContain(LOGIN_PASSWORD);
    expect(loggedArgs).not.toContain(SESSION_TOKEN);
    await moduleRef.close();
  });

  it('logs only account identifiers after a successful login', async () => {
    const user = {
      id: 'user-123',
      steamxId: 'ADM123',
      name: 'Admin',
      passwordHash: 'password-hash',
      status: UserStatus.ACTIVE,
      userType: UserType.PLATFORM_STAFF,
      schoolId: null,
      mustChangePassword: false,
      role: { key: 'admin' },
      school: null,
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthContextRepository,
          useValue: { findLoginUser: vi.fn().mockResolvedValue(user) },
        },
        { provide: PasswordService, useValue: { verify: vi.fn().mockResolvedValue(true) } },
        { provide: TokenService, useValue: { sign: vi.fn().mockResolvedValue(SESSION_TOKEN) } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login('adm123', LOGIN_PASSWORD)).resolves.toEqual({
      token: SESSION_TOKEN,
      profile: {
        id: 'user-123',
        steamxId: 'ADM123',
        name: 'Admin',
        roleKey: 'admin',
        userType: UserType.PLATFORM_STAFF,
        schoolId: null,
        mustChangePassword: false,
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: 'user-123', schoolId: null },
      'Login successful',
    );
    const loggedArgs = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(loggedArgs).not.toContain(LOGIN_PASSWORD);
    expect(loggedArgs).not.toContain(SESSION_TOKEN);
    await moduleRef.close();
  });

  it('does not log passwords or tokens during password changes and resets', async () => {
    const currentPassword = 'Current password for test 2026!';
    const newPassword = 'New password for test 2026!';
    const resetPassword = 'Admin selected password 2026!';
    const findCredentials = vi.fn().mockResolvedValue({
      steamxId: 'AUTH123',
      passwordHash: 'stored-hash',
    });
    const findPasswordResetTarget = vi.fn().mockResolvedValue({
      id: 'target-user',
      steamxId: 'STU123',
    });
    const updatePassword = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthContextRepository,
          useValue: { findCredentials, findPasswordResetTarget, updatePassword },
        },
        {
          provide: PasswordService,
          useValue: {
            verify: vi.fn().mockResolvedValue(true),
            hash: vi.fn().mockResolvedValue('new-stored-hash'),
          },
        },
        { provide: TokenService, useValue: { sign: vi.fn().mockResolvedValue(SESSION_TOKEN) } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);
    const actor: AuthContext = {
      userId: 'actor-user',
      steamxId: 'ADM123',
      name: 'Admin',
      roleKey: 'admin',
      userType: UserType.PLATFORM_STAFF,
      schoolId: null,
      mustChangePassword: true,
    };

    await service.changePassword(actor, currentPassword, newPassword);
    await service.resetPassword(actor, 'target-user', resetPassword);

    expect(updatePassword).toHaveBeenNthCalledWith(1, actor.userId, 'new-stored-hash', false);
    expect(updatePassword).toHaveBeenNthCalledWith(2, 'target-user', 'new-stored-hash', true);
    const loggedArgs = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]);
    expect(loggedArgs).not.toContain(currentPassword);
    expect(loggedArgs).not.toContain(newPassword);
    expect(loggedArgs).not.toContain(resetPassword);
    expect(loggedArgs).not.toContain(SESSION_TOKEN);
    expect(logger.info).toHaveBeenCalledWith(
      { actorId: actor.userId, targetId: 'target-user' },
      'Password reset',
    );
    await moduleRef.close();
  });
});
