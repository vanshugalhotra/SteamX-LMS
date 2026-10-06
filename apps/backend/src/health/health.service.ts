import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service.js';

const RESPONSE_TIMEOUT_MS = 2_000;
const STATEMENT_TIMEOUT_MS = 1_500;
const CONNECTION_WAIT_MS = 1_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  async isDatabaseReady(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Database readiness check timed out')),
          RESPONSE_TIMEOUT_MS,
        );
      });

      await Promise.race([this.runDatabaseCheck(), timeout]);
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Database readiness check failed');
      return false;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private async runDatabaseCheck(): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        await tx.$queryRaw`SELECT 1`;
      },
      { maxWait: CONNECTION_WAIT_MS, timeout: RESPONSE_TIMEOUT_MS },
    );
  }
}
