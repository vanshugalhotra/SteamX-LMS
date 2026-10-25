import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';
import { StorageCleanupQueueService } from '../../storage/storage-cleanup-queue.service.js';
import { AssetCleanupService } from './asset-cleanup.service.js';
import { safeError } from '../../common/errors/safe-error.js';

@Injectable()
export class CleanupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  /** Whether Nest should start automatic cleanup when the API boots. */
  private readonly enabled: boolean;
  /** Delay between cleanup runs, in milliseconds. */
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private stopped = false;

  constructor(
    private readonly storageCleanupQueue: StorageCleanupQueueService,
    private readonly assetCleanup: AssetCleanupService,
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    const cleanup = config.get('cleanup', { infer: true });
    this.enabled = cleanup.enabled;
    this.intervalMs = cleanup.intervalSeconds * 1_000;
    this.logger.setContext(CleanupScheduler.name);
  }

  onApplicationBootstrap(): void {
    // Skip automatic scheduling in environments such as tests that disable cleanup.
    if (this.enabled) {
      this.start();
    }
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  /** Starts the timer once; the first cleanup run happens after the configured interval. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.stopped = false;
    this.scheduleNext();
  }

  /** Cancels a waiting timer; an active cleanup run is allowed to finish without rescheduling. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.started = false;
    }
  }

  /** Runs each cleanup step in order and returns their counts to the caller. */
  async runOnce(): Promise<{
    queue: Awaited<ReturnType<StorageCleanupQueueService['drain']>>;
    assets: Awaited<ReturnType<AssetCleanupService['run']>>;
  }> {
    // Every cleanup step is idempotent, so multiple API instances can run without coordination.
    const queue = await this.storageCleanupQueue.drain();
    const assets = await this.assetCleanup.run();
    return { queue, assets };
  }

  private scheduleNext(): void {
    if (this.stopped) {
      return;
    }
    // Schedule only one run at a time, and let this timer stop blocking process shutdown.
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.runOnce();
      const counts = {
        queueDone: result.queue.done,
        queueFailed: result.queue.failed,
        queueSkipped: result.queue.skipped,
        staleFilesDeleted: result.assets.staleFilesDeleted,
        ghostAssetsDeleted: result.assets.ghostAssetsDeleted,
      };
      if (
        result.queue.done > 0 ||
        result.assets.staleFilesDeleted > 0 ||
        result.assets.ghostAssetsDeleted > 0
      ) {
        this.logger.info(counts, 'Cleanup run completed');
      } else {
        this.logger.debug(counts, 'Cleanup run completed with no changes');
      }
    } catch (error) {
      // Keep the scheduler alive after transient failures; the next run can retry pending work.
      this.logger.error({ error: safeError(error) }, 'Cleanup run failed');
    } finally {
      this.timer = undefined;
      // Schedule after the run finishes so a slow cleanup cannot overlap its next tick.
      if (!this.stopped) {
        this.scheduleNext();
      } else {
        this.started = false;
      }
    }
  }
}
