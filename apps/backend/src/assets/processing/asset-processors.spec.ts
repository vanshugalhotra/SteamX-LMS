import { AssetFileStatus, AssetType } from '../../generated/prisma/client.js';
import type { AssetFile } from '../../generated/prisma/client.js';
import { AssetProcessorRegistry } from './asset-processor.registry.js';
import {
  NoPlaybackAssetProcessor,
  VideoPassthroughAssetProcessor,
} from './passthrough-asset-processors.js';

const file: AssetFile = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  status: AssetFileStatus.UPLOADING,
  storageKey:
    'assets/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/original',
  originalFilename: 'source.bin',
  mimeType: 'image/png',
  sizeBytes: 1n,
  playbackKey: null,
  uploadId: null,
  processingJobId: null,
  lastError: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('asset processors', () => {
  it.each([AssetType.IMAGE, AssetType.PDF])('%s returns no playback key', async (type) => {
    const processor = new NoPlaybackAssetProcessor(type);
    await expect(processor.process(file)).resolves.toEqual({ playbackKey: null });
  });

  it('uses the original storage key for MP4 video playback', async () => {
    const processor = new VideoPassthroughAssetProcessor();
    await expect(processor.process(file)).resolves.toEqual({ playbackKey: file.storageKey });
  });

  it('indexes processors by asset type', () => {
    const image = new NoPlaybackAssetProcessor(AssetType.IMAGE);
    const pdf = new NoPlaybackAssetProcessor(AssetType.PDF);
    const video = new VideoPassthroughAssetProcessor();
    const registry = new AssetProcessorRegistry([image, pdf, video]);

    expect(registry.get(AssetType.IMAGE)).toBe(image);
    expect(registry.get(AssetType.PDF)).toBe(pdf);
    expect(registry.get(AssetType.VIDEO)).toBe(video);
  });
});
