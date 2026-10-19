import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  it('reports the database as unavailable when its readiness check fails', async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(new Error('Database connection failed')),
    };
    const logger = { setContext: vi.fn(), warn: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    const service = moduleRef.get(HealthService);

    await expect(service.isDatabaseReady()).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Database readiness check failed',
    );
    await moduleRef.close();
  });
});
