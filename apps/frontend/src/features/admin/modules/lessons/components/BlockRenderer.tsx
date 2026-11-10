import type { JSONContent } from '@tiptap/react';
import type { Asset } from '@/features/admin/assets/model/types';
import { getBlockLabel, getRichTextDoc, type BlockTextField } from '../model/blocks';
import type { LessonContent, LessonContentBlock } from '../model/types';
import { AccordionBlockEditor } from './AccordionBlockEditor';
import { AssetBlockEditor } from './media/AssetBlockEditor';
import { RichTextEditor } from './richtext/RichTextEditor';
import { TwoColumnBlockEditor } from './TwoColumnBlockEditor';

interface BlockRendererProps {
  block: LessonContentBlock;
  index: number;
  contextLabel?: string;
  allowLayout?: boolean;
  full: boolean;
  assets: LessonContent['assets'];
  incompleteIds: string[];
  invalidAccordionIds: string[];
  disabled: boolean;
  onRichTextChange: (id: string, doc: JSONContent) => void;
  onAttachAsset: (id: string, asset: Asset) => void;
  onFieldChange: (id: string, key: BlockTextField, value: string) => void;
  onAccordionTitleChange: (id: string, title: string) => void;
  onAddColumnBlock: (
    parentId: string,
    column: 0 | 1,
    block: LessonContentBlock,
  ) => void;
  onRemoveBlock: (id: string) => void;
}

export function BlockRenderer({
  block,
  index,
  contextLabel,
  allowLayout = true,
  full,
  assets,
  incompleteIds,
  invalidAccordionIds,
  disabled,
  onRichTextChange,
  onAttachAsset,
  onFieldChange,
  onAccordionTitleChange,
  onAddColumnBlock,
  onRemoveBlock,
}: BlockRendererProps) {
  switch (block.type) {
    case 'RICH_TEXT':
      return (
        <RichTextEditor
          label={
            contextLabel
              ? `${contextLabel} rich text`
              : `Rich text block ${String(index + 1)}`
          }
          initialValue={getRichTextDoc(block)}
          editable={!disabled}
          onChange={(doc) => {
            onRichTextChange(block.id, doc);
          }}
        />
      );
    case 'ACCORDION':
      return (
        <AccordionBlockEditor
          block={block}
          contextLabel={contextLabel}
          invalid={invalidAccordionIds.includes(block.id)}
          disabled={disabled}
          onTitleChange={onAccordionTitleChange}
          onBodyChange={onRichTextChange}
        />
      );
    case 'TWO_COLUMN':
      if (!allowLayout) {
        return (
          <p className="rounded-xl bg-brand-side p-3 text-xs leading-5 text-gray-600">
            Layout blocks can’t be nested inside columns.
          </p>
        );
      }
      return (
        <TwoColumnBlockEditor
          block={block}
          disabled={disabled}
          full={full}
          onAdd={onAddColumnBlock}
          onRemove={onRemoveBlock}
          renderBlock={(child, column) => (
            <BlockRenderer
              block={child}
              index={index}
              contextLabel={`Column ${String(column + 1)}`}
              allowLayout={false}
              assets={assets}
              full={full}
              incompleteIds={incompleteIds}
              invalidAccordionIds={invalidAccordionIds}
              disabled={disabled}
              onRichTextChange={onRichTextChange}
              onAttachAsset={onAttachAsset}
              onFieldChange={onFieldChange}
              onAccordionTitleChange={onAccordionTitleChange}
              onAddColumnBlock={onAddColumnBlock}
              onRemoveBlock={onRemoveBlock}
            />
          )}
        />
      );
    case 'IMAGE':
    case 'VIDEO':
    case 'PDF':
      return (
        <AssetBlockEditor
          block={block}
          asset={block.assetId ? assets[block.assetId] : undefined}
          invalid={incompleteIds.includes(block.id)}
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
