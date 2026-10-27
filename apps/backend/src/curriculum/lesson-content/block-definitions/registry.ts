import { BlockType } from '../../../generated/prisma/enums.js';
import type { BlockDefinition } from '../validation/types.js';
import { accordionDefinition } from './accordion.definition.js';
import { imageDefinition } from './image.definition.js';
import { pdfDefinition } from './pdf.definition.js';
import { richTextDefinition } from './rich-text.definition.js';
import { twoColumnDefinition } from './two-column.definition.js';
import { videoDefinition } from './video.definition.js';

export const blockDefinitions: Partial<Record<BlockType, BlockDefinition>> = {
  [BlockType.RICH_TEXT]: richTextDefinition,
  [BlockType.ACCORDION]: accordionDefinition,
  [BlockType.IMAGE]: imageDefinition,
  [BlockType.VIDEO]: videoDefinition,
  [BlockType.PDF]: pdfDefinition,
  [BlockType.TWO_COLUMN]: twoColumnDefinition,
};
