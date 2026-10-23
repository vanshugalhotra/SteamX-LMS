import { AssetType } from '../generated/prisma/client.js';
import type { FileKind } from './file-signatures.js';

/** Upload types supported now; the database enum intentionally also contains legacy PPTX. */
export const SUPPORTED_ASSET_TYPES = [AssetType.IMAGE, AssetType.PDF, AssetType.VIDEO] as const;

export type SupportedAssetType = (typeof SUPPORTED_ASSET_TYPES)[number];
export type AssetLimits = {
  image: number;
  pdf: number;
  video: number;
};
export type AssetRuleErrorCode =
  'ASSET_TYPE_NOT_SUPPORTED' | 'MIME_NOT_ALLOWED' | 'FILE_TOO_LARGE' | 'FILE_SIZE_INVALID';

const ALLOWED_MIME_TYPES: Record<SupportedAssetType, readonly string[]> = {
  [AssetType.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
  [AssetType.PDF]: ['application/pdf'],
  [AssetType.VIDEO]: ['video/mp4'],
};

const MIME_SIGNATURE_KIND: Record<string, FileKind> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'application/pdf': 'PDF',
  'video/mp4': 'MP4',
};

export class AssetRuleError extends Error {
  constructor(
    readonly code: AssetRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = AssetRuleError.name;
  }
}

/** Narrows the database enum to the formats this upload endpoint currently accepts. */
export function isSupportedAssetType(type: string): type is SupportedAssetType {
  return SUPPORTED_ASSET_TYPES.some((supportedType) => supportedType === type);
}

/** MIME comparisons are case-insensitive and ignore surrounding whitespace, not parameters. */
export function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

/** Checks type, declared MIME, integer size, and the configured per-type ceiling. */
export function validateAssetUpload(
  type: string,
  mimeType: string,
  sizeBytes: number,
  limits: AssetLimits,
): SupportedAssetType {
  if (!isSupportedAssetType(type)) {
    throw new AssetRuleError('ASSET_TYPE_NOT_SUPPORTED', 'Asset type is not supported.');
  }

  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!ALLOWED_MIME_TYPES[type].includes(normalizedMimeType)) {
    throw new AssetRuleError('MIME_NOT_ALLOWED', 'The MIME type is not allowed for this asset.');
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new AssetRuleError('FILE_SIZE_INVALID', 'File size must be a positive integer.');
  }

  const limit = {
    [AssetType.IMAGE]: limits.image,
    [AssetType.PDF]: limits.pdf,
    [AssetType.VIDEO]: limits.video,
  }[type];
  if (sizeBytes > limit) {
    throw new AssetRuleError('FILE_TOO_LARGE', 'File exceeds the maximum size for this asset.');
  }
  return type;
}

/** Returns the signature expected for an allowed MIME, or null for an unknown MIME. */
export function expectedFileKindForMime(mimeType: string): FileKind | null {
  return MIME_SIGNATURE_KIND[normalizeMimeType(mimeType)] ?? null;
}

/** Keeps storage keys independent of client-controlled filenames. */
export function buildOriginalKey(assetId: string, fileId: string): string {
  return `assets/${assetId}/${fileId}/original`;
}
