import type { AssetFile } from '../../generated/prisma/client.js';

export type AssetFileSelection = Pick<
  AssetFile,
  | 'id'
  | 'assetId'
  | 'status'
  | 'originalFilename'
  | 'mimeType'
  | 'sizeBytes'
  | 'lastError'
  | 'createdAt'
  | 'updatedAt'
>;
