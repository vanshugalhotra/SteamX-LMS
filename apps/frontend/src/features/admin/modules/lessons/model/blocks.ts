import { FileText, type LucideIcon } from 'lucide-react';
import type { JSONContent } from '@tiptap/react';
import type { LessonContentBlock } from './types';

type BlockType = LessonContentBlock['type'];

export interface BlockMeta {
  label: string;
  icon: LucideIcon;
  accent: string;
  create?: () => LessonContentBlock;
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export const BLOCK_META: Partial<Record<BlockType, BlockMeta>> = {
  RICH_TEXT: {
    label: 'Rich text',
    icon: FileText,
    accent: 'before:bg-teal-400',
    create: newRichTextBlock,
  },
};

export const FALLBACK_ACCENT = 'before:bg-gray-300';

export const getBlockLabel = (type: BlockType) =>
  BLOCK_META[type]?.label ??
  type
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export function getRichTextDoc(block: LessonContentBlock): JSONContent {
  const doc = block.content.doc;
  return typeof doc === 'object' && doc !== null && 'type' in doc
    ? (doc as JSONContent)
    : EMPTY_DOC;
}

export function moveBlock(blocks: LessonContentBlock[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function newRichTextBlock(): LessonContentBlock {
  return {
    id: crypto.randomUUID(),
    type: 'RICH_TEXT',
    content: { format: 'tiptap', doc: EMPTY_DOC },
  };
}

export function insertBlock(
  blocks: LessonContentBlock[],
  block: LessonContentBlock,
  index = blocks.length,
) {
  return [...blocks.slice(0, index), block, ...blocks.slice(index)];
}
