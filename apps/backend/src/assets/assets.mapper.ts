import type { Asset, AssetFile } from '../generated/prisma/client.js';
import type { CreateUploadUrlResult } from '../storage/storage.types.js';
import {
  AssetDto,
  AssetFileDto,
  CreateAssetResponseDto,
  UploadInstructionsDto,
} from './dto/asset-response.dto.js';
import type { AssetFileSelection } from './library/asset-file-selection.js';
import type { AssetLibraryDetailDto, AssetListItemDto } from './dto/asset-library-response.dto.js';
import type { AssetDetailRecord, AssetLibraryRecord } from './assets.types.js';
import { pickCurrentFile } from './library/asset-library.js';

/** Exposes only the asset fields intended for API clients. */
export function toAssetDto(asset: Asset): AssetDto {
  return {
    id: asset.id,
    type: asset.type,
    title: asset.title,
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

/** Shapes file state for JSON responses without exposing storage internals. */
export function toAssetFileDto(file: AssetFileSelection): AssetFileDto {
  return {
    id: file.id,
    assetId: file.assetId,
    status: file.status,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    // Prisma BigInt values are not JSON-serializable, so response DTOs expose numbers.
    sizeBytes: file.sizeBytes === null ? null : Number(file.sizeBytes),
    lastError: file.lastError,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

export function toAssetListItemDto(asset: AssetLibraryRecord): AssetListItemDto {
  const [file] = asset.files;
  if (!file) {
    throw new Error('Asset library query returned an asset without a READY file.');
  }
  return {
    id: asset.id,
    type: asset.type,
    title: asset.title,
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    file: {
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes === null ? null : Number(file.sizeBytes),
      originalFilename: file.originalFilename,
    },
  };
}

export function toAssetLibraryDetailDto(
  asset: AssetDetailRecord,
  usedIn: AssetLibraryDetailDto['usedIn'],
): AssetLibraryDetailDto {
  const file = pickCurrentFile(asset.files);
  return {
    id: asset.id,
    type: asset.type,
    title: asset.title,
    status: asset.status,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    file: file ? toAssetFileDto(file) : null,
    usedIn,
  };
}

/** Copies the storage contract into the API's upload-instructions shape. */
export function toUploadInstructionsDto(upload: CreateUploadUrlResult): UploadInstructionsDto {
  return {
    url: upload.url,
    method: upload.method,
    headers: upload.headers,
    expiresAt: upload.expiresAt,
  };
}

/** Builds the POST response from explicitly mapped database and storage values. */
export function toCreateAssetResponse(
  asset: Asset,
  file: AssetFile,
  upload: CreateUploadUrlResult,
): CreateAssetResponseDto {
  return {
    asset: toAssetDto(asset),
    file: toAssetFileDto(file),
    upload: toUploadInstructionsDto(upload),
  };
}
