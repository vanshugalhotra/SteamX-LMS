import type { AssetSummary } from '../../assets/assets.types.js';
import type { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import type { NormalizedBlock } from './types.js';

export function toLessonContentResponse(
  version: number,
  blocks: NormalizedBlock[],
  assets: Map<string, AssetSummary>,
): LessonContentResponseDto {
  return {
    version,
    blocks,
    assets: Object.fromEntries(assets),
  };
}
