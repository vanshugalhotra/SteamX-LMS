import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../src/config/env.schema.js';
import { validateEnv } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { S3StorageService, createS3Client } from '../../src/storage/s3-storage.service.js';
import { StorageCleanupQueueService } from '../../src/storage/storage-cleanup-queue.service.js';

const UPLOAD_URL_LATE_PUT_GRACE_SECONDS = 300;
const TEST_OBJECT_BODY = Buffer.from('storage cleanup smoke test');

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/gi, '[redacted URL]');
}

function assertLocalDatabase(databaseUrl: string): void {
  const database = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', 'postgres'].includes(database.hostname.toLowerCase())
  ) {
    throw new Error('Refusing to run: DATABASE_URL must use a local PostgreSQL host.');
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    log('Usage: pnpm storage:cleanup:smoke');
    return;
  }

  const env: Env = validateEnv(process.env);
  assertLocalDatabase(env.DATABASE_URL);

  const config = new ConfigService<Env, true>(env);
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const prisma = new PrismaService(config, logger);
  const s3 = createS3Client({
    region: env.storage.region,
    accessKeyId: env.storage.accessKeyId,
    secretAccessKey: env.storage.secretAccessKey,
  });
  const storage = new S3StorageService(config, s3, logger);
  const queue = new StorageCleanupQueueService(prisma, storage, config, logger);
  const testId = randomUUID().toLowerCase();
  const eligiblePrefix = `assets/${testId}/eligible/`;
  const youngPrefix = `assets/${testId}/young/`;
  const eligibleKey = `${eligiblePrefix}smoke.txt`;
  const youngKey = `${youngPrefix}smoke.txt`;
  const queueIds: string[] = [];
  const createdPrefixes: string[] = [];
  let failure: unknown;
  const cleanupErrors: string[] = [];

  try {
    await prisma.onModuleInit();

    const eligibleBefore = new Date(
      Date.now() - (env.storage.uploadUrlTtlSeconds + UPLOAD_URL_LATE_PUT_GRACE_SECONDS) * 1_000,
    );
    const existingEligibleEntries = await prisma.storageCleanupQueue.count({
      where: {
        isPrefix: true,
        doneAt: null,
        queuedAt: { lte: eligibleBefore },
      },
    });
    if (existingEligibleEntries > 0) {
      throw new Error(
        `Refusing to drain ${existingEligibleEntries} pre-existing eligible prefix entries. Use an idle local database.`,
      );
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: eligibleKey,
        Body: TEST_OBJECT_BODY,
        ContentType: 'text/plain',
      }),
    );
    createdPrefixes.push(eligiblePrefix);
    await s3.send(
      new PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: youngKey,
        Body: TEST_OBJECT_BODY,
        ContentType: 'text/plain',
      }),
    );
    createdPrefixes.push(youngPrefix);

    const eligibleEntry = await prisma.storageCleanupQueue.create({
      data: {
        objectKey: eligiblePrefix,
        isPrefix: true,
        queuedAt: new Date(eligibleBefore.getTime() - 1_000),
      },
      select: { id: true },
    });
    queueIds.push(eligibleEntry.id);

    const youngEntry = await prisma.storageCleanupQueue.create({
      data: { objectKey: youngPrefix, isPrefix: true },
      select: { id: true },
    });
    queueIds.push(youngEntry.id);

    const result = await queue.drain({ batchSize: 10, maxBatches: 1 });
    const [eligibleAfter, youngAfter, eligibleObject, youngObject] = await Promise.all([
      prisma.storageCleanupQueue.findUnique({
        where: { id: eligibleEntry.id },
        select: { doneAt: true },
      }),
      prisma.storageCleanupQueue.findUnique({
        where: { id: youngEntry.id },
        select: { doneAt: true },
      }),
      storage.head(eligibleKey),
      storage.head(youngKey),
    ]);

    if (
      result.done !== 1 ||
      result.failed !== 0 ||
      result.skipped !== 0 ||
      !eligibleAfter?.doneAt ||
      eligibleObject !== null ||
      youngAfter?.doneAt !== null ||
      youngObject === null
    ) {
      throw new Error(
        `Unexpected queue result: ${JSON.stringify({
          result,
          eligibleMarkedDone: Boolean(eligibleAfter?.doneAt),
          eligibleObjectRemains: eligibleObject !== null,
          youngMarkedDone: Boolean(youngAfter?.doneAt),
          youngObjectRemains: youngObject !== null,
        })}`,
      );
    }

    log('PASS: eligible prefix was deleted from S3 and marked done.');
    log('PASS: young prefix and queue entry were left untouched.');
    log('The smoke test will now remove its own queue entries and test prefixes.');
  } catch (error) {
    failure = error;
  } finally {
    for (const prefix of createdPrefixes) {
      try {
        await storage.deleteByPrefix(prefix);
      } catch (error) {
        cleanupErrors.push(`Could not remove test prefix: ${safeMessage(error)}`);
      }
    }

    if (queueIds.length > 0) {
      try {
        await prisma.storageCleanupQueue.deleteMany({ where: { id: { in: queueIds } } });
      } catch (error) {
        cleanupErrors.push(`Could not remove test queue entries: ${safeMessage(error)}`);
      }
    }

    s3.destroy();
    try {
      await prisma.onModuleDestroy();
    } catch (error) {
      cleanupErrors.push(`Could not close the database connection: ${safeMessage(error)}`);
    }
  }

  if (failure !== undefined || cleanupErrors.length > 0) {
    const messages = [...(failure === undefined ? [] : [safeMessage(failure)]), ...cleanupErrors];
    throw new Error(messages.join('\n'));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Storage cleanup smoke test failed: ${safeMessage(error)}\n`);
  process.exitCode = 1;
});
