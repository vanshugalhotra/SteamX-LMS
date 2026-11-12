import type { AssetSummary } from '../../assets/assets.types.js';
import type { NormalizedBlock } from './validation/types.js';

export type LessonContentTree = {
  title: string;
  contentVersion: number;
  blocks: NormalizedBlock[];
  assets: Map<string, AssetSummary>;
};
