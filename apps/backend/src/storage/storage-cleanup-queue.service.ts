import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';
import { safeError } from '../common/errors/safe-error.js';

const UPLOAD_URL_LATE_PUT_GRACE_SECONDS = 300;
// Cap queue pages per run so a large backlog cannot keep one cleanup run busy indefinitely.
const DEFAULT_MAX_BATCHES = 20;

/** Optional limits for one queue drain; omitted values use the configured batch size and default page cap. */
export interface StorageCleanupDrainOptions {
  batchSize?: number;
  maxBatches?: number;
}

/** Counts entries handled by this drain and eligible object entries that are not supported yet. */
export interface StorageCleanupDrainResult {
  done: number;
  failed: number;
  skipped: number;
}

/** Drains delayed S3 prefix-deletion jobs and leaves failures pending for a later retry. */
@Injectable()
export class StorageCleanupQueueService {
  /** How long clients can upload, before the extra late-upload grace period. */
  private readonly uploadUrlTtlSeconds: number;
  /** Maximum queue entries fetched per page. */
  private readonly defaultBatchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    // Use the same upload URL lifetime as asset creation so queued prefixes remain safe to delete.
    this.uploadUrlTtlSeconds = config.get('storage.uploadUrlTtlSeconds', { infer: true });
    this.defaultBatchSize = config.get('cleanup.batchSize', { infer: true });
    this.logger.setContext(StorageCleanupQueueService.name);
  }

  /**
   * Deletes eligible queued prefixes and marks successful entries complete.
   * Failures stay pending for a later retry; object-only entries are counted but not processed.
   */
  async drain(options: StorageCleanupDrainOptions = {}): Promise<StorageCleanupDrainResult> {
    const batchSize = options.batchSize ?? this.defaultBatchSize;
    const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
    // A prefix is safe to remove only after its upload URL and late-PUT grace period have expired.
    const eligibleBefore = new Date(
      Date.now() - (this.uploadUrlTtlSeconds + UPLOAD_URL_LATE_PUT_GRACE_SECONDS) * 1_000,
    );
    const skipped = await this.prisma.storageCleanupQueue.count({
      where: {
        isPrefix: false,
        doneAt: null,
        queuedAt: { lte: eligibleBefore },
      },
    });

    if (skipped > 0) {
      this.logger.warn(
        { skipped },
        'Eligible object cleanup entries are waiting for prefix deletion support',
      );
    }

    let done = 0;
    let failed = 0;
    let cursorId: string | undefined;
    const entriesToProcess: Array<{ id: string; objectKey: string }> = [];

    // Read all selected pages before changing doneAt; otherwise completed rows leave the result set and
    // can shift later rows past the cursor, causing eligible work to be skipped until another drain.
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const entries = await this.prisma.storageCleanupQueue.findMany({
        where: {
          isPrefix: true,
          doneAt: null,
          queuedAt: { lte: eligibleBefore },
        },
        orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
        take: batchSize,
        ...(cursorId === undefined ? {} : { cursor: { id: cursorId }, skip: 1 }),
      });

      if (entries.length === 0) {
        break;
      }

      entriesToProcess.push(...entries);
      cursorId = entries.at(-1)?.id; // last entry in this batch becomes the cursor for the next batch
      if (entries.length < batchSize) {
        break;
      }
    }

    for (const entry of entriesToProcess) {
      try {
        // Prefix deletion is idempotent, so concurrent API instances can safely retry the same entry.
        await this.storage.deleteByPrefix(entry.objectKey);
        // Only mark it complete if another worker has not already done so.
        await this.prisma.storageCleanupQueue.updateMany({
          where: { id: entry.id, doneAt: null },
          data: { doneAt: new Date() },
        });
        done += 1;
      } catch (error) {
        failed += 1;
        // Leave the row pending so the next scheduled drain can retry it.
        this.logger.error(
          { entryId: entry.id, objectKey: entry.objectKey, error: safeError(error) },
          'Storage cleanup entry failed and will be retried',
        );
      }
    }

    return { done, failed, skipped };
  }
}
