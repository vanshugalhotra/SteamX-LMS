import type { JSONContent } from '@tiptap/react';
import { getBlockLabel, getRichTextDoc } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';
import { RichTextEditor } from './richtext/RichTextEditor';

export function BlockRenderer({
  block,
  index,
  disabled,
  onRichTextChange,
}: {
  block: LessonContentBlock;
  index: number;
  disabled: boolean;
  onRichTextChange: (id: string, doc: JSONContent) => void;
}) {
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
    default:
      return (
        <p className="rounded-xl bg-brand-side p-3 text-xs leading-5 text-gray-600">
          This {getBlockLabel(block.type)} block is preserved. Editing it will be added in a
          follow-up.
        </p>
      );
  }
}
