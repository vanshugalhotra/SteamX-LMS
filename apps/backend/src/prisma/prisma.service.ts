import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';

const IDLE_TIMEOUT_MS = 30_000;
const MAX_LIFETIME_SECONDS = 1_800;
const STATEMENT_TIMEOUT_MS = 30_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    const pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: config.get('DB_POOL_MAX', { infer: true }),
      connectionTimeoutMillis: config.get('DB_CONNECTION_TIMEOUT_MS', { infer: true }),
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      maxLifetimeSeconds: MAX_LIFETIME_SECONDS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
      keepAlive: true,
      application_name: 'steamx-api',
    });

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    this.logger.setContext(PrismaService.name);

    // Without this listener, a dropped idle connection crashes the process.
    this.pool.on('error', (err) => {
      this.logger.error({ err }, 'Idle PostgreSQL client error');
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.logger.info('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to connect to PostgreSQL');
      await this.close();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
    this.logger.info('Disconnected from PostgreSQL');
  }

  private async close(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (err) {
      this.logger.error({ err }, 'Failed to disconnect Prisma');
    }
    try {
      await this.pool.end();
    } catch (err) {
      this.logger.error({ err }, 'Failed to close PostgreSQL pool');
    }
  }
}
