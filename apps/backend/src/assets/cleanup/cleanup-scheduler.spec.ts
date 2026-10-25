import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { vi } from 'vitest';
import { StorageCleanupQueueService } from '../../storage/storage-cleanup-queue.service.js';
import { AssetCleanupService } from './asset-cleanup.service.js';
import { CleanupScheduler } from './cleanup-scheduler.js';

describe('CleanupScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not schedule a timer when cleanup is disabled', async () => {
    vi.useFakeTimers();
    const { scheduler, queue, assetCleanup } = await createScheduler(false);

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(queue.drain).not.toHaveBeenCalled();
    expect(assetCleanup.run).not.toHaveBeenCalled();
  });

  it('runs queue cleanup before asset cleanup and returns both results', async () => {
    const { scheduler, queue, assetCleanup } = await createScheduler(true);

    await expect(scheduler.runOnce()).resolves.toEqual({
      queue: { done: 0, failed: 0, skipped: 0 },
      assets: { staleFilesDeleted: 0, ghostAssetsDeleted: 0 },
    });
    expect(queue.drain.mock.invocationCallOrder[0]).toBeLessThan(
      assetCleanup.run.mock.invocationCallOrder[0]!,
    );
  });

  it('runs the first tick after an interval and waits for each run before scheduling the next', async () => {
    vi.useFakeTimers();
    let resolveFirstRun!: (value: { done: number; failed: number; skipped: number }) => void;
    const firstRun = new Promise<{ done: number; failed: number; skipped: number }>((resolve) => {
      resolveFirstRun = resolve;
    });
    const { scheduler, queue } = await createScheduler(true, {
      drain: vi.fn().mockReturnValueOnce(firstRun).mockResolvedValue({
        done: 0,
        failed: 0,
        skipped: 0,
      }),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(999);
    expect(queue.drain).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(queue.drain).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(queue.drain).toHaveBeenCalledTimes(1);

    resolveFirstRun({ done: 0, failed: 0, skipped: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(queue.drain).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('catches a failed tick and continues scheduling', async () => {
    vi.useFakeTimers();
    const { scheduler, queue, logger } = await createScheduler(true, {
      drain: vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue({ done: 0, failed: 0, skipped: 0 }),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(queue.drain).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(queue.drain).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not reschedule a tick that is still running when stopped', async () => {
    vi.useFakeTimers();
    let resolveFirstRun!: (value: { done: number; failed: number; skipped: number }) => void;
    const firstRun = new Promise<{ done: number; failed: number; skipped: number }>((resolve) => {
      resolveFirstRun = resolve;
    });
    const { scheduler, queue } = await createScheduler(true, {
      drain: vi.fn().mockReturnValue(firstRun),
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.stop();
    resolveFirstRun({ done: 0, failed: 0, skipped: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(queue.drain).toHaveBeenCalledOnce();
  });

  it('unrefs the scheduled timeout', async () => {
    const unref = vi.fn();
    const timer = { unref } as unknown as NodeJS.Timeout;
    vi.spyOn(globalThis, 'setTimeout').mockReturnValue(timer);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);
    const { scheduler } = await createScheduler(true);

    scheduler.start();

    expect(unref).toHaveBeenCalledOnce();
    scheduler.stop();
  });

  async function createScheduler(
    enabled: boolean,
    queueOverrides: { drain: ReturnType<typeof vi.fn> } = {
      drain: vi.fn().mockResolvedValue({ done: 0, failed: 0, skipped: 0 }),
    },
  ) {
    const assetCleanup = {
      run: vi.fn().mockResolvedValue({ staleFilesDeleted: 0, ghostAssetsDeleted: 0 }),
    };
    const logger = {
      setContext: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        CleanupScheduler,
        { provide: StorageCleanupQueueService, useValue: queueOverrides },
        { provide: AssetCleanupService, useValue: assetCleanup },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'cleanup'
                ? { enabled, intervalSeconds: 1, batchSize: 50, assetStaleFileAfterHours: 24 }
                : undefined,
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    return {
      scheduler: module.get(CleanupScheduler),
      queue: queueOverrides,
      assetCleanup,
      logger,
    };
  }
});
