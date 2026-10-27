import { normalizeRichText } from '../rich-text/tiptap-normalizer.js';
import type { BlockDefinition } from '../validation/types.js';

export const richTextDefinition: BlockDefinition = {
  allowedInColumn: true,
  validateContent: (content, path, issues) => normalizeRichText(content, path, issues),
};
