import type { JSONContent } from '@tiptap/react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { ACCORDION_TITLE_MAX_LENGTH } from '../config/lessons.config';
import type { LessonContentBlock } from '../model/types';
import { RichTextEditor } from './richtext/RichTextEditor';

function getBodyDoc(block: LessonContentBlock): JSONContent {
  const body = block.content.body;
  if (typeof body !== 'object' || body === null || !('doc' in body)) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  const doc = body.doc;
  return typeof doc === 'object' && doc !== null && 'type' in doc
    ? (doc as JSONContent)
    : { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function AccordionBlockEditor({
  block,
  contextLabel,
  invalid,
  disabled,
  onTitleChange,
  onBodyChange,
}: {
  block: LessonContentBlock;
  contextLabel?: string;
  invalid: boolean;
  disabled: boolean;
  onTitleChange: (id: string, value: string) => void;
  onBodyChange: (id: string, doc: JSONContent) => void;
}) {
  const id = useId();
  const title = typeof block.content.title === 'string' ? block.content.title : '';
  const errorId = `${id}-error`;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-title`} className="mb-1 block text-xs font-medium">
          {contextLabel ? `Title (${contextLabel})` : 'Title'}
        </label>
        <Input
          id={`${id}-title`}
          maxLength={ACCORDION_TITLE_MAX_LENGTH}
          readOnly={disabled}
          value={title}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => {
            onTitleChange(block.id, event.target.value);
          }}
        />
        {invalid && (
          <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">
            Add an accordion title to save this block.
          </p>
        )}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium">Content</p>
        <RichTextEditor
          label={contextLabel ? `Accordion content (${contextLabel})` : 'Accordion content'}
          initialValue={getBodyDoc(block)}
          editable={!disabled}
          onChange={(doc) => {
            onBodyChange(block.id, doc);
          }}
        />
      </div>
    </div>
  );
}
