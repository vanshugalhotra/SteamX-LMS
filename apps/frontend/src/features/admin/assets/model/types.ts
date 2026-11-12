// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
import type { ContentStatus } from '@/lib/content-status';

/** Mirrors the backend enum, including legacy PPTX assets that may still exist. */
export type AssetType = 'IMAGE' | 'VIDEO' | 'PDF' | 'PPTX';
export type SupportedAssetType = Exclude<AssetType, 'PPTX'>;
export type AssetFileStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
export type AssetStatus = Extract<ContentStatus, 'ACTIVE' | 'ARCHIVED'>;
export type UploadHeaders = Record<'Content-Type' | 'If-None-Match', string>;

export interface AssetFileSummary {
  id: string;
  status: AssetFileStatus;
  lastError: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
}

export interface Asset {
  id: string;
  type: AssetType;
  title: string;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  file: AssetFileSummary | null;
}

export interface AssetListParams {
  page: number;
  limit: number;
  type?: AssetType;
  status?: AssetStatus;
  fileStatus?: AssetFileStatus;
  search?: string;
}

export interface AssetFile {
  id: string;
  assetId: string;
  status: AssetFileStatus;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetUsageItem {
  lessonId: string;
  lessonTitle: string;
  lessonStatus: ContentStatus;
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  courseTitle: string;
}

export interface AssetDetail extends Omit<Asset, 'file'> {
  file: AssetFile | null;
  usedIn: {
    total: number;
    items: AssetUsageItem[];
  };
}

export interface AssetAccess {
  url: string;
  expiresAt: string;
  type: AssetType;
  mimeType: string;
}

export interface CreateAssetPayload {
  type: SupportedAssetType;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface RequestAssetFileUploadPayload {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadInstructions {
  url: string;
  method: 'PUT';
  headers: UploadHeaders;
  expiresAt: string;
}

export interface AssetUploadRequest {
  asset: Omit<Asset, 'file'>;
  file: AssetFile;
  upload: UploadInstructions;
}

export interface UpdateAssetPayload {
  title: string;
}
