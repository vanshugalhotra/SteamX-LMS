import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContextRepository } from '../auth-context.repository.js';
import { FirstAdminService } from './first-admin.service.js';
import { PasswordService } from './password.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('FirstAdminService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets the normalized admin password and requires a password change', async () => {
    const findAdminPasswordResetTarget = vi.fn().mockResolvedValue({
      id: 'admin-user',
      role: { key: 'admin' },
    });
    const hash = vi.fn().mockResolvedValue('password-hash');
    const updatePassword = vi.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        FirstAdminService,
        { provide: PrismaService, useValue: {} },
        { provide: PasswordService, useValue: { hash } },
        {
          provide: AuthContextRepository,
          useValue: { findAdminPasswordResetTarget, updatePassword },
        },
      ],
    }).compile();
    const service = moduleRef.get(FirstAdminService);
    const password = 'Recovered admin password 2026!';

    await expect(service.resetAdminPassword({ steamxId: ' adm123 ', password })).resolves.toBe(
      'ADM123',
    );

    expect(findAdminPasswordResetTarget).toHaveBeenCalledWith('ADM123');
    expect(hash).toHaveBeenCalledWith(password);
    expect(updatePassword).toHaveBeenCalledWith('admin-user', 'password-hash', true);
    await moduleRef.close();
  });

  it('reports migration and concurrent-deletion errors clearly during recovery', async () => {
    const findAdminPasswordResetTarget = vi.fn().mockResolvedValue({
      id: 'admin-user',
      role: { key: 'admin' },
    });
    const updatePassword = vi.fn().mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        FirstAdminService,
        { provide: PrismaService, useValue: {} },
        {
          provide: PasswordService,
          useValue: { hash: vi.fn().mockResolvedValue('password-hash') },
        },
        {
          provide: AuthContextRepository,
          useValue: { findAdminPasswordResetTarget, updatePassword },
        },
      ],
    }).compile();
    const service = moduleRef.get(FirstAdminService);
    const input = { steamxId: 'ADM123', password: 'Recovered admin password 2026!' };

    await expect(service.resetAdminPassword(input)).rejects.toThrow(
      'Admin account ADM123 no longer exists.',
    );

    findAdminPasswordResetTarget.mockRejectedValueOnce({
      name: 'PrismaClientKnownRequestError',
      code: 'P2021',
    });
    await expect(service.resetAdminPassword(input)).rejects.toThrow(
      'Database migrations have not been applied. Run migrate:deploy.',
    );
    await moduleRef.close();
  });

  it('reports a serialization conflict as another process creating the Admin', async () => {
    const transaction = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        FirstAdminService,
        { provide: PrismaService, useValue: { $transaction: transaction } },
        { provide: PasswordService, useValue: { hash: vi.fn() } },
        { provide: AuthContextRepository, useValue: {} },
      ],
    }).compile();
    const service = moduleRef.get(FirstAdminService);

    await expect(
      service.create({
        steamxId: 'ADM123',
        password: 'Recovered admin password 2026!',
      }),
    ).rejects.toThrow('Another process may be creating the admin. Re-run the command to check.');
    await moduleRef.close();
  });

  it.each([
    [
      { steamxId: 'a!', password: 'Recovered admin password 2026!' },
      'ADMIN_STEAMX_ID must be 3–32 characters',
    ],
    [
      { steamxId: 'ADM123', password: 'Recovered admin password 2026!', name: '   ' },
      'ADMIN_NAME must not be blank.',
    ],
  ])('rejects invalid first-admin input %#', async (input, message) => {
    const transaction = vi.fn();
    const hash = vi.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FirstAdminService,
        { provide: PrismaService, useValue: { $transaction: transaction } },
        { provide: PasswordService, useValue: { hash } },
        { provide: AuthContextRepository, useValue: {} },
      ],
    }).compile();
    const service = moduleRef.get(FirstAdminService);

    await expect(service.create(input)).rejects.toThrow(message);

    expect(hash).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    await moduleRef.close();
  });
});
