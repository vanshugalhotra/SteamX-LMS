import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    const connectionString = config.get('DATABASE_URL', { infer: true });
    const pool = new Pool({
      connectionString,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    });

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.info('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to connect to PostgreSQL');

      try {
        await this.$disconnect();
      } catch (disconnectError) {
        this.logger.error(
          { err: disconnectError },
          'Failed to disconnect Prisma after startup failure',
        );
      } finally {
        try {
          await this.pool.end();
        } catch (poolError) {
          this.logger.error(
            { err: poolError },
            'Failed to close PostgreSQL pool after startup failure',
          );
        }
      }
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } finally {
      await this.pool.end();
    }
    this.logger.info('Disconnected from PostgreSQL');
  }
}
