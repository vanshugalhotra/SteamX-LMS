import type { JSONContent } from '@tiptap/react';
import type { Asset } from '@/features/admin/assets/model/types';
import { getBlockLabel, getRichTextDoc, type BlockTextField } from '../model/blocks';
import type { LessonContent, LessonContentBlock } from '../model/types';
import { AssetBlockEditor } from './media/AssetBlockEditor';
import { RichTextEditor } from './richtext/RichTextEditor';

interface BlockRendererProps {
  block: LessonContentBlock;
  index: number;
  assets: LessonContent['assets'];
  invalid: boolean;
  disabled: boolean;
  onRichTextChange: (id: string, doc: JSONContent) => void;
  onAttachAsset: (id: string, asset: Asset) => void;
  onFieldChange: (id: string, key: BlockTextField, value: string) => void;
}

export function BlockRenderer({
  block,
  index,
  assets,
  invalid,
  disabled,
  onRichTextChange,
  onAttachAsset,
  onFieldChange,
}: BlockRendererProps) {
  switch (block.type) {
    case 'RICH_TEXT':
      return (
        <RichTextEditor
          label={`Rich text block ${String(index + 1)}`}
          initialValue={getRichTextDoc(block)}
          editable={!disabled}
          onChange={(doc) => {
            onRichTextChange(block.id, doc);
          }}
        />
      );
    case 'IMAGE':
    case 'VIDEO':
    case 'PDF':
      return (
        <AssetBlockEditor
          block={block}
          asset={block.assetId ? assets[block.assetId] : undefined}
          invalid={invalid}
          disabled={disabled}
          onPick={(asset) => {
            onAttachAsset(block.id, asset);
          }}
          onFieldChange={(key, value) => {
            onFieldChange(block.id, key, value);
          }}
        />
      );
    default:
      return (
        <p className="rounded-xl bg-brand-side p-3 text-xs leading-5 text-gray-600">
          This {getBlockLabel(block.type)} block is preserved. Editing it will be added in a
          follow-up.
        </p>
      );
  }
}
