import { File as FileIcon, FileText, ImageIcon, Video, type LucideIcon } from 'lucide-react';
import type { AssetType } from '../../../assets/model/types';
import type { JSONContent } from '@tiptap/react';
import type { LessonContentBlock } from './types';

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

export const isAssetBlock = (block: LessonContentBlock) =>
  BLOCK_META[block.type]?.assetType !== undefined;

export const findIncompleteBlockIds = (blocks: LessonContentBlock[]) =>
  blocks.filter((block) => isAssetBlock(block) && !block.assetId).map((block) => block.id);

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
export const ADDABLE_BLOCKS = (['RICH_TEXT', 'IMAGE', 'VIDEO', 'PDF'] as const).flatMap((type) => {
  const meta = BLOCK_META[type];
  return meta?.create ? [{ type, label: meta.label, icon: meta.icon, create: meta.create }] : [];
});
