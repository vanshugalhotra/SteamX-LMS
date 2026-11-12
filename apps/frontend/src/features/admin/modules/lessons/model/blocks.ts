import {
  Columns2,
  File as FileIcon,
  FileText,
  ImageIcon,
  ListCollapse,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { AssetType } from '../../../assets/model/types';
import type { JSONContent } from '@tiptap/react';
import type { LessonContentBlock } from './types';
import { ACCORDION_TITLE_MAX_LENGTH } from '../config/lessons.config';

type BlockType = LessonContentBlock['type'];

export type BlockTextField = 'alt' | 'caption';

export interface BlockMeta {
  label: string;
  icon: LucideIcon;
  accent: string;
  create?: () => LessonContentBlock;
  /** Asset-backed blocks only: the asset type the picker is filtered by. */
  assetType?: AssetType;
  /** Optional text fields stored in `content` (the backend trims and omits empty ones). */
  fields?: { key: BlockTextField; label: string }[];
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function isJSONContent(value: unknown): value is JSONContent {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export function getRichTextDocument(value: unknown): JSONContent {
  return isJSONContent(value) ? value : EMPTY_DOC;
}

export const FALLBACK_ACCENT = 'before:bg-gray-300';

const CAPTION = { key: 'caption', label: 'Caption (optional)' } as const;

const newAssetBlock = (type: BlockType) => (): LessonContentBlock => ({
  id: crypto.randomUUID(),
  type,
  content: {},
});

export const BLOCK_META: Partial<Record<BlockType, BlockMeta>> = {
  RICH_TEXT: {
    label: 'Rich text',
    icon: FileText,
    accent: 'before:bg-teal-400',
    create: newRichTextBlock,
  },
  IMAGE: {
    label: 'Image',
    icon: ImageIcon,
    accent: 'before:bg-coral-500',
    create: newAssetBlock('IMAGE'),
    assetType: 'IMAGE',
    fields: [{ key: 'alt', label: 'Alt text (describe the image)' }, CAPTION],
  },
  VIDEO: {
    label: 'Video',
    icon: Video,
    accent: 'before:bg-magenta-500',
    create: newAssetBlock('VIDEO'),
    assetType: 'VIDEO',
    fields: [CAPTION],
  },
  ACCORDION: {
    label: 'Accordion',
    icon: ListCollapse,
    accent: 'before:bg-teal-400',
    create: newAccordionBlock,
  },
  TWO_COLUMN: {
    label: 'Two columns',
    icon: Columns2,
    accent: 'before:bg-gray-400',
    create: newTwoColumnBlock,
  },
  PDF: {
    label: 'PDF',
    icon: FileIcon,
    accent: 'before:bg-yellow-500',
    create: newAssetBlock('PDF'),
    assetType: 'PDF',
    fields: [CAPTION],
  },
};

export const getBlockLabel = (type: BlockType) =>
  BLOCK_META[type]?.label ??
  type
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());

export function getRichTextDoc(block: LessonContentBlock): JSONContent {
  return getRichTextDocument(block.content.doc);
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

export function newAccordionBlock(): LessonContentBlock {
  return {
    id: crypto.randomUUID(),
    type: 'ACCORDION',
    content: { title: '', body: { format: 'tiptap', doc: EMPTY_DOC } },
  };
}

export function newTwoColumnBlock(): LessonContentBlock {
  return {
    id: crypto.randomUUID(),
    type: 'TWO_COLUMN',
    content: {},
    columns: [null, null],
  };
}

export function insertBlock(
  blocks: LessonContentBlock[],
  block: LessonContentBlock,
  index = blocks.length,
) {
  return [...blocks.slice(0, index), block, ...blocks.slice(index)];
}

export const isAssetBlock = (block: LessonContentBlock) =>
  BLOCK_META[block.type]?.assetType !== undefined;

export const findIncompleteBlockIds = (blocks: LessonContentBlock[]) =>
  visitBlocks(blocks)
    .filter((block) => isAssetBlock(block) && !block.assetId)
    .map((block) => block.id);

export function findInvalidAccordionIds(blocks: LessonContentBlock[]) {
  return visitBlocks(blocks)
    .filter((block) => {
      if (block.type !== 'ACCORDION') return false;
      const title = block.content.title;
      return (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > ACCORDION_TITLE_MAX_LENGTH
      );
    })
    .map((block) => block.id);
}

export function countBlocks(blocks: LessonContentBlock[]): number {
  return visitBlocks(blocks).length;
}

export function updateBlockById(
  blocks: LessonContentBlock[],
  id: string,
  update: (block: LessonContentBlock) => LessonContentBlock,
): LessonContentBlock[] {
  const next = blocks.map((block) => {
    return updateNestedBlock(block, id, update);
  });
  return next.every((block, index) => block === blocks[index]) ? blocks : next;
}

function updateNestedBlock(
  block: LessonContentBlock,
  id: string,
  update: (block: LessonContentBlock) => LessonContentBlock,
): LessonContentBlock {
  let updated = block.id === id ? update(block) : block;
  if (!Array.isArray(updated.columns)) return updated;

  const [first, second] = updated.columns;
  const nextFirst = first ? updateNestedBlock(first, id, update) : null;
  const nextSecond = second ? updateNestedBlock(second, id, update) : null;
  if (nextFirst === first && nextSecond === second) return updated;
  updated = { ...updated, columns: [nextFirst, nextSecond] };
  return updated;
}

export function removeBlockById(blocks: LessonContentBlock[], id: string): LessonContentBlock[] {
  const next = blocks.flatMap((block) => {
    const updated = removeNestedBlock(block, id);
    return updated ? [updated] : [];
  });
  return next.length === blocks.length && next.every((block, index) => block === blocks[index])
    ? blocks
    : next;
}

function removeNestedBlock(block: LessonContentBlock, id: string): LessonContentBlock | null {
  if (block.id === id) return null;
  if (!Array.isArray(block.columns)) return block;

  const [first, second] = block.columns;
  const nextFirst = first ? removeNestedBlock(first, id) : null;
  const nextSecond = second ? removeNestedBlock(second, id) : null;
  if (nextFirst === first && nextSecond === second) return block;
  return { ...block, columns: [nextFirst, nextSecond] };
}

function visitBlocks(blocks: LessonContentBlock[]): LessonContentBlock[] {
  const visited: LessonContentBlock[] = [];
  for (const block of blocks) {
    visited.push(block);
    if (block.columns) {
      for (const child of block.columns) {
        if (child) visited.push(...visitBlocks([child]));
      }
    }
  }
  return visited;
}

/** Sets one text field; empty values are dropped, matching what the backend stores. */
export function setBlockField(
  block: LessonContentBlock,
  key: BlockTextField,
  value: string,
): LessonContentBlock {
  const content = Object.fromEntries(
    Object.entries({ ...block.content, [key]: value }).filter(([, v]) => v !== ''),
  );
  return { ...block, content };
}

export const getBlockField = (block: LessonContentBlock, key: BlockTextField) => {
  const value = block.content[key];
  return typeof value === 'string' ? value : '';
};

/** Block types the editor can create, in menu order. */
export const ADDABLE_BLOCKS = (
  ['RICH_TEXT', 'ACCORDION', 'TWO_COLUMN', 'IMAGE', 'VIDEO', 'PDF'] as const
).flatMap((type) => {
  const meta = BLOCK_META[type];
  return meta?.create ? [{ type, label: meta.label, icon: meta.icon, create: meta.create }] : [];
});

export type AddableBlock = (typeof ADDABLE_BLOCKS)[number];
export const COLUMN_ADDABLE_BLOCKS = ADDABLE_BLOCKS.filter(({ type }) => type !== 'TWO_COLUMN');
