import { AssetType } from '../generated/prisma/client.js';
import { assertValidKey } from '../storage/storage-keys.js';
import {
  AssetRuleError,
  buildOriginalKey,
  expectedFileKindForMime,
  normalizeMimeType,
  validateAssetUpload,
} from './asset-rules.js';

const limits = { image: 100, pdf: 200, video: 300 };

describe('asset rules', () => {
  it.each([
    [AssetType.IMAGE, 'image/jpeg', 'JPEG'],
    [AssetType.IMAGE, 'image/png', 'PNG'],
    [AssetType.IMAGE, 'image/webp', 'WEBP'],
    [AssetType.PDF, 'application/pdf', 'PDF'],
    [AssetType.VIDEO, 'video/mp4', 'MP4'],
  ] as const)('allows %s with %s and maps its signature', (type, mimeType, kind) => {
    expect(validateAssetUpload(type, mimeType, 1, limits)).toBe(type);
    expect(expectedFileKindForMime(mimeType)).toBe(kind);
  });

  it.each([
    [AssetType.IMAGE, 100],
    [AssetType.PDF, 200],
    [AssetType.VIDEO, 300],
  ] as const)('allows %s files exactly at their configured limit', (type, limit) => {
    const mime = {
      [AssetType.IMAGE]: 'image/jpeg',
      [AssetType.PDF]: 'application/pdf',
      [AssetType.VIDEO]: 'video/mp4',
    }[type];
    expect(validateAssetUpload(type, mime, limit, limits)).toBe(type);
  });

  it.each([
    [AssetType.IMAGE, 'image/jpeg', 101],
    [AssetType.PDF, 'application/pdf', 201],
    [AssetType.VIDEO, 'video/mp4', 301],
  ] as const)('rejects %s files above their configured limit', (type, mime, sizeBytes) => {
    expect(() => validateAssetUpload(type, mime, sizeBytes, limits)).toThrowError(
      expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
    );
  });

  it.each([0, -1, 1.5])('rejects non-positive integer sizes: %s', (sizeBytes) => {
    expect(() => validateAssetUpload(AssetType.IMAGE, 'image/jpeg', sizeBytes, limits)).toThrow(
      expect.objectContaining({ code: 'FILE_SIZE_INVALID' }),
    );
  });

  it.each(['PPTX', 'OTHER'])('rejects unsupported type %s', (type) => {
    expect(() => validateAssetUpload(type, 'application/pdf', 1, limits)).toThrow(
      expect.objectContaining({ code: 'ASSET_TYPE_NOT_SUPPORTED' }),
    );
  });

  it.each([
    [AssetType.IMAGE, 'application/pdf'],
    [AssetType.PDF, 'image/png'],
    [AssetType.VIDEO, 'video/quicktime'],
    [AssetType.IMAGE, 'image/jpeg; charset=utf-8'],
  ])('rejects MIME %s for type %s', (type, mimeType) => {
    expect(() => validateAssetUpload(type, mimeType, 1, limits)).toThrow(
      expect.objectContaining({ code: 'MIME_NOT_ALLOWED' }),
    );
  });

  it('normalizes MIME by trimming and lowercasing', () => {
    expect(normalizeMimeType('  IMAGE/PNG  ')).toBe('image/png');
    expect(validateAssetUpload(AssetType.IMAGE, ' IMAGE/PNG ', 1, limits)).toBe(AssetType.IMAGE);
  });

  it('builds an original key exclusively from IDs and accepts it as a storage key', () => {
    const key = buildOriginalKey(
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(key).toBe(
      'assets/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/original',
    );
    expect(() => assertValidKey(key)).not.toThrow();
  });

  it('exposes rule errors with stable public codes', () => {
    try {
      validateAssetUpload('PPTX', 'application/pdf', 1, limits);
    } catch (error) {
      expect(error).toBeInstanceOf(AssetRuleError);
      expect(error).toMatchObject({ code: 'ASSET_TYPE_NOT_SUPPORTED' });
    }
  });
});
