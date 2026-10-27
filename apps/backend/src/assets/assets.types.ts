import { AssetFileStatus } from '../generated/prisma/client.js';
import type { Asset, AssetFile, ContentStatus, Prisma } from '../generated/prisma/client.js';

export const ASSET_LIBRARY_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  files: {
    where: { status: AssetFileStatus.READY },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      mimeType: true,
      sizeBytes: true,
      originalFilename: true,
    },
  },
} satisfies Prisma.AssetSelect;

export const ASSET_DETAIL_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  files: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      assetId: true,
      status: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.AssetSelect;

export const ASSET_ACCESS_SELECT = {
  id: true,
  type: true,
  files: {
    where: { status: AssetFileStatus.READY },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      id: true,
      assetId: true,
      storageKey: true,
      playbackKey: true,
      originalFilename: true,
      mimeType: true,
    },
  },
} satisfies Prisma.AssetSelect;

export const ASSET_SUMMARY_SELECT = {
  id: true,
  type: true,
  title: true,
  status: true,
  files: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      assetId: true,
      status: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.AssetSelect;

export type AssetLibraryRecord = Prisma.AssetGetPayload<{ select: typeof ASSET_LIBRARY_SELECT }>;
export type AssetDetailRecord = Prisma.AssetGetPayload<{ select: typeof ASSET_DETAIL_SELECT }>;
export type AssetAccessRecord = Prisma.AssetGetPayload<{ select: typeof ASSET_ACCESS_SELECT }>;
export type AssetSummaryRecord = Prisma.AssetGetPayload<{ select: typeof ASSET_SUMMARY_SELECT }>;
export type AssetSummary = {
  id: string;
  type: Asset['type'];
  title: string;
  status: Asset['status'];
  file: {
    status: AssetFile['status'];
    mimeType: string | null;
    sizeBytes: number | null;
    originalFilename: string | null;
    lastError: string | null;
  } | null;
};

export type AssetFileForCompletion = Prisma.AssetFileGetPayload<{
  include: { asset: { select: { type: true } } };
}>;

/** Data needed to create a file before the client has uploaded its object. */
export interface CreateAssetFileRecordInput {
  id: string;
  assetId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MakeReadyInput {
  sizeBytes: number;
  mimeType: string;
  playbackKey: string | null;
}

export type ReplaceAssetFileResult =
  | { status: 'not_found' }
  | { status: 'in_progress' }
  | { status: 'created'; asset: Asset; file: AssetFile; removedCount: number };

export type UpdateAssetStatusResult = {
  asset: Asset;
  oldStatus: ContentStatus;
  changed: boolean;
};

export type DeleteAssetResult = Pick<Asset, 'id' | 'title' | 'type'> & {
  removedFileCount: number;
};
