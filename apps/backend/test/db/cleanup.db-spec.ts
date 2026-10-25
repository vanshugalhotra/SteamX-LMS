import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module.js';
import { AssetCleanupService } from '../../src/assets/cleanup/asset-cleanup.service.js';
import { buildOriginalKey } from '../../src/assets/asset-rules.js';
import { AssetFileStatus, AssetType, BlockType } from '../../src/generated/prisma/client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { StorageCleanupQueueService } from '../../src/storage/storage-cleanup-queue.service.js';
import type { Env } from '../../src/config/env.schema.js';
import { createTestApp, getTestStorageService } from '../support/create-test-app.js';
import { InMemoryStorageService } from '../support/in-memory-storage.service.js';

const UPLOAD_URL_TTL_SECONDS = 900;
const LATE_PUT_GRACE_SECONDS = 300;
const QUEUE_DELAY_MS = (UPLOAD_URL_TTL_SECONDS + LATE_PUT_GRACE_SECONDS) * 1_000;

describe('cleanup services (database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: InMemoryStorageService;
  let queue: StorageCleanupQueueService;
  let assets: AssetCleanupService;
  let cleanupBatchSize: number;
  const assetIds: string[] = [];
  const lessonIds: string[] = [];
  const moduleIds: string[] = [];
  const courseIds: string[] = [];
  const directQueueIds: string[] = [];
  const storagePrefixes: string[] = [];

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    prisma = app.get(PrismaService);
    storage = getTestStorageService(app);
    queue = app.get(StorageCleanupQueueService);
    assets = app.get(AssetCleanupService);
    cleanupBatchSize = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('cleanup.batchSize', { infer: true });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    storage.failDeletes(null);
    if (lessonIds.length > 0) {
      await prisma.lessonBlock.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      lessonIds.length = 0;
    }
    if (moduleIds.length > 0) {
      await prisma.module.deleteMany({ where: { id: { in: moduleIds } } });
      moduleIds.length = 0;
    }
    if (courseIds.length > 0) {
      await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
      courseIds.length = 0;
    }
    if (assetIds.length > 0) {
      await prisma.assetFile.deleteMany({ where: { assetId: { in: assetIds } } });
      await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      assetIds.length = 0;
    }
    if (directQueueIds.length > 0) {
      await prisma.storageCleanupQueue.deleteMany({ where: { id: { in: directQueueIds } } });
      directQueueIds.length = 0;
    }
    if (storagePrefixes.length > 0) {
      await prisma.storageCleanupQueue.deleteMany({
        where: {
          OR: storagePrefixes.map((prefix) => ({ objectKey: { startsWith: prefix } })),
        },
      });
    }
    for (const prefix of storagePrefixes) {
      await storage.deleteByPrefix(prefix);
    }
    storagePrefixes.length = 0;
  });

  it('drains eligible prefixes, leaves young and completed entries alone, and retries failures', async () => {
    const eligible = await createQueueEntry({ queuedAt: eligibleTimestamp() });
    const young = await createQueueEntry({ queuedAt: new Date() });
    const emptyPrefix = await createQueueEntry({ queuedAt: eligibleTimestamp() });
    const completed = await createQueueEntry({
      queuedAt: eligibleTimestamp(),
      doneAt: new Date(),
    });
    storage.simulateUpload(`${eligible.prefix}object`, {
      bytes: Buffer.from('object'),
      contentType: 'application/octet-stream',
    });
    storage.simulateUpload(`${young.prefix}object`, {
      bytes: Buffer.from('young'),
      contentType: 'application/octet-stream',
    });

    storage.failDeletes(new Error('temporary storage failure'));
    const failedRun = await queue.drain();
    expect(failedRun).toMatchObject({ failed: 2 });
    expect(
      await prisma.storageCleanupQueue.findUnique({ where: { id: eligible.id } }),
    ).toMatchObject({
      doneAt: null,
    });
    expect(await prisma.storageCleanupQueue.findUnique({ where: { id: young.id } })).toMatchObject({
      doneAt: null,
    });
    expect(
      await prisma.storageCleanupQueue.findUnique({ where: { id: completed.id } }),
    ).toMatchObject({
      doneAt: completed.doneAt,
    });
    expect(storage.has(`${eligible.prefix}object`)).toBe(true);

    storage.failDeletes(null);
    const nextRun = await queue.drain();
    expect(nextRun.done).toBe(2);
    expect(
      await prisma.storageCleanupQueue.findUnique({ where: { id: eligible.id } }),
    ).toMatchObject({
      doneAt: expect.any(Date),
    });
    expect(
      await prisma.storageCleanupQueue.findUnique({ where: { id: emptyPrefix.id } }),
    ).toMatchObject({
      doneAt: expect.any(Date),
    });
    expect(await prisma.storageCleanupQueue.findUnique({ where: { id: young.id } })).toMatchObject({
      doneAt: null,
    });
    expect(storage.has(`${eligible.prefix}object`)).toBe(false);
    expect(storage.has(`${young.prefix}object`)).toBe(true);
  });

  it('pages past failing entries and attempts each entry only once in a call', async () => {
    const failing = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createQueueEntry({
          objectKey: `invalid-prefix-${index}`,
          queuedAt: new Date(eligibleTimestamp().getTime() + index),
        }),
      ),
    );
    const succeeding = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        createQueueEntry({ queuedAt: new Date(eligibleTimestamp().getTime() + 10 + index) }),
      ),
    );

    const result = await queue.drain({ batchSize: 2, maxBatches: 4 });
    expect(result).toMatchObject({ done: 2, failed: 5 });
    for (const entry of failing) {
      expect(storage.deleteCallsForPrefix(entry.prefix)).toBe(1);
      await expect(
        prisma.storageCleanupQueue.findUnique({ where: { id: entry.id } }),
      ).resolves.toMatchObject({
        doneAt: null,
      });
    }
    for (const entry of succeeding) {
      expect(storage.deleteCallsForPrefix(entry.prefix)).toBe(1);
      await expect(
        prisma.storageCleanupQueue.findUnique({ where: { id: entry.id } }),
      ).resolves.toMatchObject({
        doneAt: expect.any(Date),
      });
    }
  });

  it('skips eligible non-prefix entries and honors the maximum number of batches', async () => {
    const skipped = await createQueueEntry({
      isPrefix: false,
      queuedAt: eligibleTimestamp(),
    });
    const entries = await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        createQueueEntry({ queuedAt: new Date(eligibleTimestamp().getTime() + index) }),
      ),
    );

    const firstRun = await queue.drain({ batchSize: 2, maxBatches: 2 });
    expect(firstRun).toMatchObject({ done: 4, skipped: 1 });
    expect(
      await prisma.storageCleanupQueue.count({
        where: { id: { in: entries.map(({ id }) => id) }, doneAt: null },
      }),
    ).toBe(3);
    await expect(
      prisma.storageCleanupQueue.findUnique({ where: { id: skipped.id } }),
    ).resolves.toMatchObject({ doneAt: null });
    expect(storage.deleteCallsForPrefix(skipped.prefix)).toBe(0);

    const secondRun = await queue.drain({ batchSize: 2, maxBatches: 2 });
    expect(secondRun.done).toBe(3);
  });

  it('allows two concurrent drains to complete the same eligible queue safely', async () => {
    const entries = await Promise.all(
      Array.from({ length: 8 }, () => createQueueEntry({ queuedAt: eligibleTimestamp() })),
    );

    await expect(Promise.all([queue.drain(), queue.drain()])).resolves.toHaveLength(2);
    await expect(
      prisma.storageCleanupQueue.count({
        where: { id: { in: entries.map(({ id }) => id) }, doneAt: null },
      }),
    ).resolves.toBe(0);
  });

  it('deletes stale non-READY files, preserves recent and READY files, and removes ghost assets', async () => {
    const nonReadyStatuses = [
      AssetFileStatus.UPLOADING,
      AssetFileStatus.UPLOADED,
      AssetFileStatus.PROCESSING,
      AssetFileStatus.FAILED,
    ];
    const stale = await Promise.all(
      nonReadyStatuses.map(async (status) => {
        const oldUpdatedAt = new Date(Date.now() - 48 * 60 * 60 * 1_000);
        const created = await createAssetFile(
          status,
          status === AssetFileStatus.FAILED ? oldUpdatedAt : undefined,
        );
        if (status !== AssetFileStatus.FAILED) {
          await prisma.assetFile.update({
            where: { id: created.fileId },
            data: { updatedAt: oldUpdatedAt },
          });
        }
        return created;
      }),
    );
    const recent = await createAssetFile(AssetFileStatus.UPLOADING);
    const ready = await createAssetFile(
      AssetFileStatus.READY,
      new Date(Date.now() - 48 * 60 * 60 * 1_000),
    );

    const referenced = await createEmptyAsset();
    await createLessonBlock(referenced.assetId);

    const result = await assets.run();
    expect(result.staleFilesDeleted).toBe(4);
    expect(result.ghostAssetsDeleted).toBe(4);
    for (const entry of stale) {
      await expect(
        prisma.assetFile.findUnique({ where: { id: entry.fileId } }),
      ).resolves.toBeNull();
      await expect(
        prisma.storageCleanupQueue.findMany({ where: { objectKey: entry.prefix } }),
      ).resolves.toHaveLength(1);
      await expect(prisma.asset.findUnique({ where: { id: entry.assetId } })).resolves.toBeNull();
    }
    await expect(
      prisma.assetFile.findUnique({ where: { id: recent.fileId } }),
    ).resolves.toMatchObject({ status: AssetFileStatus.UPLOADING });
    await expect(
      prisma.assetFile.findUnique({ where: { id: ready.fileId } }),
    ).resolves.toMatchObject({ status: AssetFileStatus.READY });
    await expect(
      prisma.asset.findUnique({ where: { id: referenced.assetId } }),
    ).resolves.not.toBeNull();

    await expect(assets.run()).resolves.toEqual({
      staleFilesDeleted: 0,
      ghostAssetsDeleted: 0,
    });
  });

  it('applies the stale cutoff strictly with lt on either side of the boundary', async () => {
    const fresh = await createAssetFile(AssetFileStatus.UPLOADING);
    const stale = await createAssetFile(AssetFileStatus.UPLOADING);
    await prisma.assetFile.update({
      where: { id: fresh.fileId },
      data: { updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000 + 5_000) },
    });
    await prisma.assetFile.update({
      where: { id: stale.fileId },
      data: { updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000 - 5_000) },
    });

    const result = await assets.run();
    expect(result.staleFilesDeleted).toBe(1);
    await expect(
      prisma.assetFile.findUnique({ where: { id: fresh.fileId } }),
    ).resolves.toMatchObject({ status: AssetFileStatus.UPLOADING });
    await expect(prisma.assetFile.findUnique({ where: { id: stale.fileId } })).resolves.toBeNull();
  });

  it('deletes no more than the configured batch of stale files per run', async () => {
    const staleFiles = await Promise.all(
      Array.from({ length: cleanupBatchSize + 1 }, () =>
        createAssetFile(AssetFileStatus.FAILED, new Date(Date.now() - 48 * 60 * 60 * 1_000)),
      ),
    );

    const firstRun = await assets.run();
    expect(firstRun.staleFilesDeleted).toBe(cleanupBatchSize);
    await expect(
      prisma.assetFile.count({ where: { id: { in: staleFiles.map(({ fileId }) => fileId) } } }),
    ).resolves.toBe(1);

    const secondRun = await assets.run();
    expect(secondRun.staleFilesDeleted).toBe(1);
    await expect(
      prisma.assetFile.count({ where: { id: { in: staleFiles.map(({ fileId }) => fileId) } } }),
    ).resolves.toBe(0);
  });

  async function createQueueEntry(options: {
    objectKey?: string;
    isPrefix?: boolean;
    queuedAt: Date;
    doneAt?: Date;
  }): Promise<{ id: string; prefix: string; doneAt?: Date }> {
    const prefix = options.objectKey ?? newPrefix();
    const entry = await prisma.storageCleanupQueue.create({
      data: {
        objectKey: prefix,
        isPrefix: options.isPrefix ?? true,
        queuedAt: options.queuedAt,
        doneAt: options.doneAt,
      },
    });
    directQueueIds.push(entry.id);
    return { id: entry.id, prefix, doneAt: options.doneAt };
  }

  async function createEmptyAsset(): Promise<{ assetId: string }> {
    const assetId = randomUUID().toLowerCase();
    await prisma.asset.create({
      data: { id: assetId, type: AssetType.IMAGE, title: `Cleanup ${assetId}` },
    });
    assetIds.push(assetId);
    return { assetId };
  }

  async function createAssetFile(
    status: AssetFileStatus,
    backdate?: Date,
  ): Promise<{
    assetId: string;
    fileId: string;
    prefix: string;
  }> {
    const { assetId } = await createEmptyAsset();
    const fileId = randomUUID().toLowerCase();
    const storageKey = buildOriginalKey(assetId, fileId);
    const prefix = `assets/${assetId}/${fileId}/`;
    storagePrefixes.push(`assets/${assetId}/`);
    await prisma.assetFile.create({
      data: {
        id: fileId,
        assetId,
        storageKey,
        originalFilename: 'cleanup-test.png',
        mimeType: 'image/png',
        sizeBytes: 16n,
      },
    });

    if (status !== AssetFileStatus.UPLOADING) {
      await prisma.assetFile.update({
        where: { id: fileId },
        data: { status: AssetFileStatus.UPLOADED },
      });
    }
    if (status === AssetFileStatus.PROCESSING || status === AssetFileStatus.READY) {
      await prisma.assetFile.update({
        where: { id: fileId },
        data: { status: AssetFileStatus.PROCESSING },
      });
    }
    if (status === AssetFileStatus.READY) {
      await prisma.$executeRaw`
        UPDATE "asset_files"
        SET "status" = 'READY', "updated_at" = ${backdate ?? new Date()}
        WHERE "id" = ${fileId}::uuid
      `;
    } else if (status === AssetFileStatus.FAILED) {
      await prisma.$executeRaw`
        UPDATE "asset_files"
        SET "status" = 'FAILED', "last_error" = 'test failure',
            "updated_at" = ${backdate ?? new Date()}
        WHERE "id" = ${fileId}::uuid
      `;
    }
    return { assetId, fileId, prefix };
  }

  async function createLessonBlock(assetId: string): Promise<void> {
    const course = await prisma.course.create({
      data: { title: `Cleanup course ${randomUUID()}` },
    });
    courseIds.push(course.id);
    const module = await prisma.module.create({
      data: { courseId: course.id, title: `Cleanup module ${randomUUID()}`, position: 1 },
    });
    moduleIds.push(module.id);
    const lesson = await prisma.lesson.create({
      data: {
        courseId: course.id,
        moduleId: module.id,
        title: `Cleanup lesson ${randomUUID()}`,
        position: 1,
      },
    });
    lessonIds.push(lesson.id);
    await prisma.lessonBlock.create({
      data: {
        lessonId: lesson.id,
        type: BlockType.IMAGE,
        assetId,
        content: {},
        position: 1,
      },
    });
  }

  function eligibleTimestamp(): Date {
    return new Date(Date.now() - QUEUE_DELAY_MS - 60 * 60 * 1_000);
  }

  function newPrefix(): string {
    return `assets/${randomUUID().toLowerCase()}/${randomUUID().toLowerCase()}/`;
  }
});
