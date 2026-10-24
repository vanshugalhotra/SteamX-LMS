import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AssetType } from '../generated/prisma/client.js';
import type { AssetFile } from '../generated/prisma/client.js';
import { validateEnv } from '../config/env.schema.js';
import type { Env } from '../config/env.schema.js';
import { InMemoryStorageService } from '../../test/support/in-memory-storage.service.js';
import type { AssetsRepository } from './assets.repository.js';
import { AssetAccessService } from './asset-access.service.js';

const file: Pick<
  AssetFile,
  'id' | 'assetId' | 'storageKey' | 'playbackKey' | 'originalFilename' | 'mimeType'
> = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  storageKey: 'assets/550e8400-e29b-41d4-a716-446655440000/file/original',
  playbackKey: null,
  originalFilename: 'clean-name.pdf',
  mimeType: 'application/pdf',
};

function createService(
  storage: InMemoryStorageService,
  access: Env['assetAccess'] = {
    imageTtlSeconds: 600,
    pdfTtlSeconds: 1800,
    videoTtlSeconds: 7200,
  },
) {
  const config = new ConfigService<Env, true>(
    validateEnv({
      NODE_ENV: 'test',
      AUTH_JWT_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
      DATABASE_URL: 'postgresql://localhost/steamx_test',
      AWS_REGION: 'ap-south-1',
      S3_BUCKET: 'test-bucket',
      ASSET_ACCESS_TTL_IMAGE_SECONDS: access.imageTtlSeconds,
      ASSET_ACCESS_TTL_PDF_SECONDS: access.pdfTtlSeconds,
      ASSET_ACCESS_TTL_VIDEO_SECONDS: access.videoTtlSeconds,
    }),
  );
  const repository = {} as AssetsRepository;
  const logger = { setContext: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
  return new AssetAccessService(repository, storage, config, logger);
}

describe('AssetAccessService', () => {
  it.each([
    [AssetType.IMAGE, 'image/png', 601],
    [AssetType.PDF, 'application/pdf', 1801],
    [AssetType.VIDEO, 'video/mp4', 7201],
  ] as const)('uses configured TTL and file metadata for %s', async (type, mimeType, ttl) => {
    const storage = new InMemoryStorageService();
    const service = createService(storage, {
      imageTtlSeconds: 601,
      pdfTtlSeconds: 1801,
      videoTtlSeconds: 7201,
    });
    const now = Date.now();

    const response = await service.issueForFile({ ...file, mimeType }, type);

    expect(response).toMatchObject({
      url: `memory://download/${file.storageKey}`,
      type,
      mimeType,
    });
    expect(response.expiresAt.getTime()).toBeGreaterThanOrEqual(now + ttl * 1_000);
    expect(response.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttl * 1_000);
    expect(storage.downloadRequests).toEqual([
      {
        key: file.storageKey,
        expiresInSeconds: ttl,
        contentType: mimeType,
        filename: 'clean-name.pdf',
      },
    ]);
  });

  it('uses playbackKey when present and falls back to storageKey otherwise', async () => {
    const storage = new InMemoryStorageService();
    const service = createService(storage);
    const playbackKey = `${file.storageKey.slice(0, file.storageKey.lastIndexOf('/'))}/hls/index.m3u8`;

    await service.issueForFile({ ...file, playbackKey }, AssetType.VIDEO);
    await service.issueForFile(file, AssetType.VIDEO);

    expect(storage.downloadRequests.map(({ key }) => key)).toEqual([playbackKey, file.storageKey]);
  });

  it('omits a null filename from the storage download request', async () => {
    const storage = new InMemoryStorageService();
    const service = createService(storage);

    await service.issueForFile({ ...file, originalFilename: null }, AssetType.PDF);

    expect(storage.downloadRequests.at(0)?.filename).toBeUndefined();
  });

  it('does not issue URLs for a non-READY author asset', async () => {
    const storage = new InMemoryStorageService();
    const findAssetForAccess = vi.fn().mockResolvedValue({
      id: file.assetId,
      type: AssetType.PDF,
      files: [],
    });
    const repository = { findAssetForAccess } as unknown as AssetsRepository;
    const config = new ConfigService<Env, true>(
      validateEnv({
        NODE_ENV: 'test',
        AUTH_JWT_SECRET: 'test-auth-secret-with-at-least-thirty-two-characters',
        DATABASE_URL: 'postgresql://localhost/steamx_test',
        AWS_REGION: 'ap-south-1',
        S3_BUCKET: 'test-bucket',
      }),
    );
    const service = new AssetAccessService(repository, storage, config, {
      setContext: vi.fn(),
      debug: vi.fn(),
    } as unknown as PinoLogger);

    await expect(service.issueForAuthor(file.assetId, 'user-id')).rejects.toMatchObject({
      response: { code: 'ASSET_NOT_READY' },
      status: 409,
    });
    expect(storage.downloadRequests).toEqual([]);
  });
});
