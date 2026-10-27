import type { AssetType, BlockType } from '../../../generated/prisma/enums.js';

export type Issue = { path: string; code: string; message: string };

export type LessonContentInput = { blocks: unknown[] };

export type NormalizedBlock = {
  id: string;
  type: BlockType;
  assetId?: string;
  content: Record<string, unknown>;
  columns?: [NormalizedBlock | null, NormalizedBlock | null];
};

export type BlockDefinition = {
  validateContent(content: unknown, path: string, issues: Issue[]): Record<string, unknown>;
  assetType?: AssetType;
  allowedInColumn: boolean;
};
