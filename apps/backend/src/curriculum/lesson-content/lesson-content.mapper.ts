// Shapes the lesson-content response shared by GET and PUT.
import type { AssetSummary } from '../../assets/assets.types.js';
import type { LessonContentResponseDto } from './dto/lesson-content-response.dto.js';
import type { NormalizedBlock } from './validation/types.js';

/** Convert the internal asset map into the response DTO shape. */
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
