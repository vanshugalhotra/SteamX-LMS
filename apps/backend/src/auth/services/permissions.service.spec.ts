import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContextRepository } from '../auth-context.repository.js';
import { PERMISSION } from '../permissions.js';
import { PermissionsService } from './permissions.service.js';

describe('PermissionsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when no role-permission mappings are loaded', async () => {
    const logger = { setContext: vi.fn(), warn: vi.fn() };
    const repository = { findRolePermissions: vi.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: AuthContextRepository, useValue: repository },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(PermissionsService);

    await service.onModuleInit();

    expect(logger.warn).toHaveBeenCalledWith(
      'No role-permission mappings loaded — all permission checks will deny until restart with data.',
    );
    expect(service.has('admin', PERMISSION.USER_PASSWORD_RESET)).toBe(false);
    await moduleRef.close();
  });

  it('does not warn when role-permission mappings are loaded', async () => {
    const logger = { setContext: vi.fn(), warn: vi.fn() };
    const repository = {
      findRolePermissions: vi.fn().mockResolvedValue([
        {
          key: 'admin',
          permissions: [{ permission: { key: PERMISSION.USER_PASSWORD_RESET } }],
        },
      ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: AuthContextRepository, useValue: repository },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(PermissionsService);

    await service.onModuleInit();

    expect(logger.warn).not.toHaveBeenCalled();
    expect(service.has('admin', PERMISSION.USER_PASSWORD_RESET)).toBe(true);
    await moduleRef.close();
  });
});
