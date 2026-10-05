import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const createConfig = () =>
    new ConfigService<Env, true>({
      NODE_ENV: 'test',
      PORT: 3333,
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: false,
    });

  const createLogger = () => new PinoLogger({ pinoHttp: { level: 'silent' } });

  it('logs and preserves the connection error while closing its pool when PostgreSQL is unreachable', async () => {
    const poolEnd = vi.spyOn(Pool.prototype, 'end');
    const logger = createLogger();
    const logError = vi.spyOn(logger, 'error');
    const prisma = new PrismaService(createConfig(), logger);

    try {
      await expect(prisma.onModuleInit()).rejects.toThrow(/P1001|Can't reach database server/);
      expect(poolEnd).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.anything() }),
        'Failed to connect to PostgreSQL',
      );
    } finally {
      poolEnd.mockRestore();
      logError.mockRestore();
    }
  });

  it('disconnects Prisma and closes its pool during shutdown', async () => {
    const logger = createLogger();
    const logInfo = vi.spyOn(logger, 'info');
    const prisma = new PrismaService(createConfig(), logger);
    const disconnect = vi.spyOn(prisma, '$disconnect').mockResolvedValue();
    const poolEnd = vi.spyOn(Pool.prototype, 'end').mockResolvedValue();

    try {
      await prisma.onModuleDestroy();

      expect(disconnect).toHaveBeenCalledOnce();
      expect(poolEnd).toHaveBeenCalledOnce();
      expect(logInfo).toHaveBeenCalledWith('Disconnected from PostgreSQL');
    } finally {
      disconnect.mockRestore();
      poolEnd.mockRestore();
      logInfo.mockRestore();
    }
  });
});
