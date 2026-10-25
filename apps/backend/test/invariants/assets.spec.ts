import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';
import { AssetFileStatus, AssetType, ContentStatus } from '../../src/generated/prisma/client.js';
import { AssetProcessorRegistry } from '../../src/assets/processing/asset-processor.registry.js';
import { CleanupScheduler } from '../../src/assets/cleanup/cleanup-scheduler.js';
import { getTestStorageService } from '../support/create-test-app.js';
import {
  assertEveryResponseSafe,
  assertStatus,
  startInvariantApi,
} from '../support/invariant-api.js';
import type { InvariantApi } from '../support/invariant-api.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const IMAGE_BYTES = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...Array(8).fill(0),
]);
const PDF_BYTES = Buffer.from('%PDF-1.7xxxxxxxx', 'ascii');
const VIDEO_BYTES = Buffer.from('0000ftypisom0000', 'ascii');
const INVALID_PDF_BYTES = Buffer.from('plain text bytes!', 'ascii');
const INTERNAL_ERROR_TEXT = 'processor-private-error-text';

type UploadResponse = {
  asset: { id: string; status: ContentStatus };
  file: { id: string; status: AssetFileStatus };
  upload: { url: string };
};

describe('Asset library invariants', () => {
  let api: InvariantApi;
  const assetIds = new Set<string>();

  beforeAll(async () => {
    api = await startInvariantApi();
  });

  afterEach(() => {
    assertEveryResponseSafe(api);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (api) {
      const ids = [...assetIds];
      if (ids.length > 0) {
        await api.prisma.assetFile.deleteMany({ where: { assetId: { in: ids } } });
        await api.prisma.storageCleanupQueue.deleteMany({
          where: {
            OR: ids.map((assetId) => ({
              objectKey: { startsWith: `assets/${assetId}/` },
            })),
          },
        });
        await api.prisma.asset.deleteMany({ where: { id: { in: ids } } });
      }
      await api.close();
    }
  });

  async function createUpload(
    cookie: string,
    type: AssetType,
    mimeType: string,
    bytes: Buffer,
    title = `Invariant ${type} ${randomUUID()}`,
  ): Promise<UploadResponse> {
    const response = await api.send('POST', '/api/v1/assets', {
      cookie,
      body: {
        type,
        title,
        filename: `${type.toLowerCase()}.file`,
        mimeType,
        sizeBytes: bytes.length,
      },
    });
    assertStatus(response, 201);
    const created = response.body as UploadResponse;
    assetIds.add(created.asset.id);
    getTestStorageService(api.app).simulateUpload(
      created.upload.url.replace('memory://upload/', ''),
      { bytes, contentType: mimeType },
    );
    return created;
  }

  async function replaceUpload(
    cookie: string,
    assetId: string,
    filename: string,
    mimeType: string,
    bytes: Buffer,
  ): Promise<UploadResponse> {
    const response = await api.send('POST', `/api/v1/assets/${assetId}/files`, {
      cookie,
      body: { filename, mimeType, sizeBytes: bytes.length },
    });
    assertStatus(response, 201);
    const created = response.body as UploadResponse;
    getTestStorageService(api.app).simulateUpload(
      created.upload.url.replace('memory://upload/', ''),
      { bytes, contentType: mimeType },
    );
    return created;
  }

  async function complete(cookie: string, assetId: string, fileId: string) {
    return api.send('POST', `/api/v1/assets/${assetId}/files/${fileId}/complete`, { cookie });
  }

  async function expectAtMostOneReady(assetId: string): Promise<void> {
    const readyCount = await api.prisma.assetFile.count({
      where: { assetId, status: AssetFileStatus.READY },
    });
    expect(readyCount).toBeLessThanOrEqual(1);
  }

  function expectAssetResponsesSafe(startIndex: number): void {
    const internalField = /storage[_]?key|playback[_]?key|upload[_]?id|processing[_]?job[_]?id/i;
    for (const response of api.seen.slice(startIndex)) {
      const json = JSON.stringify(response.body);
      expect(json).not.toMatch(internalField);
      expect(json).not.toContain(INTERNAL_ERROR_TEXT);
    }
  }

  it('keeps at most one READY file through replacement failures, superseding, and in-flight processing', async () => {
    const startIndex = api.seen.length;
    const cookie = (await api.login()).cookie;
    const first = await createUpload(cookie, AssetType.IMAGE, 'image/png', IMAGE_BYTES);
    assertStatus(await complete(cookie, first.asset.id, first.file.id), 200);
    await expectAtMostOneReady(first.asset.id);

    const successful = await replaceUpload(
      cookie,
      first.asset.id,
      'success.png',
      'image/png',
      IMAGE_BYTES,
    );
    assertStatus(await complete(cookie, first.asset.id, successful.file.id), 200);
    await expectAtMostOneReady(first.asset.id);

    const failed = await replaceUpload(
      cookie,
      first.asset.id,
      'failed.png',
      'image/png',
      IMAGE_BYTES,
    );
    const processor = api.app.get(AssetProcessorRegistry).get(AssetType.IMAGE);
    vi.spyOn(processor, 'process').mockRejectedValueOnce(new Error(INTERNAL_ERROR_TEXT));
    const failedResponse = await complete(cookie, first.asset.id, failed.file.id);
    assertStatus(failedResponse, 200);
    expect(failedResponse.body).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'PROCESSING_FAILED',
    });
    await expectAtMostOneReady(first.asset.id);
    expectAssetResponsesSafe(startIndex);
    vi.restoreAllMocks();

    const superseded = await api.send('POST', `/api/v1/assets/${first.asset.id}/files`, {
      cookie,
      body: { filename: 'superseded.png', mimeType: 'image/png', sizeBytes: IMAGE_BYTES.length },
    });
    assertStatus(superseded, 201);
    const inFlight = await replaceUpload(
      cookie,
      first.asset.id,
      'in-flight.png',
      'image/png',
      IMAGE_BYTES,
    );
    assertStatus(await complete(cookie, first.asset.id, superseded.body.file.id), 404, 'NOT_FOUND');

    let resolveEnteredProcessor!: () => void;
    let releaseInFlight!: () => void;
    const enteredProcessor = new Promise<void>((resolve) => {
      resolveEnteredProcessor = resolve;
    });
    const releaseProcessor = new Promise<void>((resolve) => {
      releaseInFlight = resolve;
    });
    vi.spyOn(processor, 'process').mockImplementation(async () => {
      resolveEnteredProcessor();
      await releaseProcessor;
      return { playbackKey: null };
    });
    const completion = complete(cookie, first.asset.id, inFlight.file.id);
    await enteredProcessor;
    await expectAtMostOneReady(first.asset.id);
    const blocked = await api.send('POST', `/api/v1/assets/${first.asset.id}/files`, {
      cookie,
      body: { filename: 'blocked.png', mimeType: 'image/png', sizeBytes: IMAGE_BYTES.length },
    });
    assertStatus(blocked, 409, 'REPLACEMENT_IN_PROGRESS');
    await expectAtMostOneReady(first.asset.id);
    releaseInFlight();
    assertStatus(await completion, 200);
    await expectAtMostOneReady(first.asset.id);

    await api.send('GET', `/api/v1/assets/${first.asset.id}`, { cookie });
    await api.send('GET', `/api/v1/assets/${first.asset.id}/files/${inFlight.file.id}`, { cookie });
    await api.send('GET', `/api/v1/assets/${first.asset.id}/access`, { cookie });
    expectAssetResponsesSafe(startIndex);
  });

  it('reconciles fake storage with file rows after an upload and cleanup sequence', async () => {
    const startIndex = api.seen.length;
    const cookie = (await api.login()).cookie;
    const storage = getTestStorageService(api.app);

    const image = await createUpload(cookie, AssetType.IMAGE, 'image/png', IMAGE_BYTES);
    assertStatus(await complete(cookie, image.asset.id, image.file.id), 200);
    const pdf = await createUpload(cookie, AssetType.PDF, 'application/pdf', PDF_BYTES);
    assertStatus(await complete(cookie, pdf.asset.id, pdf.file.id), 200);
    const video = await createUpload(cookie, AssetType.VIDEO, 'video/mp4', VIDEO_BYTES);
    assertStatus(await complete(cookie, video.asset.id, video.file.id), 200);

    const imageReplacement = await replaceUpload(
      cookie,
      image.asset.id,
      'replacement.png',
      'image/png',
      IMAGE_BYTES,
    );
    assertStatus(await complete(cookie, image.asset.id, imageReplacement.file.id), 200);

    const failedPdf = await replaceUpload(
      cookie,
      pdf.asset.id,
      'failed.pdf',
      'application/pdf',
      INVALID_PDF_BYTES,
    );
    const failedResponse = await complete(cookie, pdf.asset.id, failedPdf.file.id);
    assertStatus(failedResponse, 200);
    expect(failedResponse.body).toMatchObject({
      status: AssetFileStatus.FAILED,
      lastError: 'CONTENT_NOT_RECOGNIZED',
    });

    const superseded = await api.send('POST', `/api/v1/assets/${video.asset.id}/files`, {
      cookie,
      body: { filename: 'old-attempt.mp4', mimeType: 'video/mp4', sizeBytes: VIDEO_BYTES.length },
    });
    assertStatus(superseded, 201);
    const videoReplacement = await replaceUpload(
      cookie,
      video.asset.id,
      'replacement.mp4',
      'video/mp4',
      VIDEO_BYTES,
    );
    assertStatus(await complete(cookie, video.asset.id, superseded.body.file.id), 404, 'NOT_FOUND');
    assertStatus(await complete(cookie, video.asset.id, videoReplacement.file.id), 200);

    const archived = await api.send('PATCH', `/api/v1/assets/${video.asset.id}/status`, {
      cookie,
      body: { status: ContentStatus.ARCHIVED },
    });
    assertStatus(archived, 200);
    await api.send('GET', '/api/v1/assets', { cookie });
    await api.send('GET', `/api/v1/assets/${video.asset.id}`, { cookie });
    await api.send('GET', `/api/v1/assets/${video.asset.id}/access`, { cookie });
    await api.send('GET', `/api/v1/assets/${video.asset.id}/files/${videoReplacement.file.id}`, {
      cookie,
    });

    assertStatus(await api.send('DELETE', `/api/v1/assets/${pdf.asset.id}`, { cookie }), 204);

    const abandoned = await api.send('POST', '/api/v1/assets', {
      cookie,
      body: {
        type: AssetType.IMAGE,
        title: `Abandoned ${randomUUID()}`,
        filename: 'abandoned.png',
        mimeType: 'image/png',
        sizeBytes: IMAGE_BYTES.length,
      },
    });
    assertStatus(abandoned, 201);
    const abandonedAsset = abandoned.body as UploadResponse;
    assetIds.add(abandonedAsset.asset.id);

    const config = api.app.get<ConfigService<Env, true>>(ConfigService);
    const staleAt = new Date(
      Date.now() -
        (config.get('cleanup.assetStaleFileAfterHours', { infer: true }) + 1) * 3_600_000,
    );
    await api.prisma.assetFile.update({
      where: { id: abandonedAsset.file.id },
      data: { updatedAt: staleAt },
    });
    await api.prisma.assetFile.updateMany({
      where: {
        assetId: { in: [...assetIds] },
        status: { not: AssetFileStatus.READY },
      },
      data: { updatedAt: staleAt },
    });

    const oldEnough = new Date(
      Date.now() - (config.get('storage.uploadUrlTtlSeconds', { infer: true }) + 301) * 1_000,
    );
    const scheduler = api.app.get(CleanupScheduler);
    let completed = false;
    for (let run = 0; run < 5; run += 1) {
      await api.prisma.storageCleanupQueue.updateMany({
        where: {
          doneAt: null,
          objectKey: { startsWith: 'assets/' },
        },
        data: { queuedAt: oldEnough },
      });
      const result = await scheduler.runOnce();
      expect(result.queue.failed).toBe(0);
      const pendingPrefixes = await api.prisma.storageCleanupQueue.count({
        where: {
          doneAt: null,
          isPrefix: true,
          objectKey: { startsWith: 'assets/' },
        },
      });
      const remainingStaleFiles = await api.prisma.assetFile.count({
        where: {
          assetId: { in: [...assetIds] },
          status: { not: AssetFileStatus.READY },
          updatedAt: { lt: staleAt },
        },
      });
      const remainingGhostAssets = await api.prisma.asset.count({
        where: {
          id: { in: [...assetIds] },
          files: { none: {} },
          blocks: { none: {} },
        },
      });
      if (pendingPrefixes === 0 && remainingStaleFiles === 0 && remainingGhostAssets === 0) {
        completed = true;
        break;
      }
    }
    expect(completed).toBe(true);

    const files = await api.prisma.assetFile.findMany({
      select: { storageKey: true, playbackKey: true, status: true },
    });
    const referencedKeys = new Set(
      files.flatMap(({ storageKey, playbackKey }) =>
        playbackKey ? [storageKey, playbackKey] : [storageKey],
      ),
    );
    const storedKeys = new Set(storage.keys().filter((key) => key.startsWith('assets/')));
    expect(storedKeys).toEqual(referencedKeys);
    for (const file of files) {
      if (file.status === AssetFileStatus.READY) {
        expect(storage.has(file.storageKey)).toBe(true);
        if (file.playbackKey) {
          expect(storage.has(file.playbackKey)).toBe(true);
        }
      }
    }
    expectAssetResponsesSafe(startIndex);
  });
});
