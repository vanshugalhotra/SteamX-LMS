import type { JSONContent } from '@tiptap/react';
import type { LessonContentBlock } from '../model/types';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockCard } from './BlockCard';
import { BlockRenderer } from './BlockRenderer';

export function BlockList({
  blocks,
  disabled,
  onAdd,
  onMove,
  onRemove,
  onRichTextChange,
}: {
  blocks: LessonContentBlock[];
  disabled: boolean;
  onAdd: (block: LessonContentBlock) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onRichTextChange: (id: string, doc: JSONContent) => void;
}) {
  if (blocks.length === 0) {
    return (
      <section className="rounded-3xl border-2 border-dashed border-brand-line px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-brand-navy">This lesson is empty</h2>
        <p className="mx-auto mb-5 mt-1 max-w-sm text-xs leading-5 text-gray-600">
          Add your first block to introduce a topic, explain a concept, or share instructions.
        </p>
        <AddBlockMenu disabled={disabled} onAdd={onAdd} />
      </section>
    );
  }

  return (
    <section aria-label="Lesson content" className="space-y-4">
      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          type={block.type}
          index={index}
          count={blocks.length}
          disabled={disabled}
          onMove={(direction) => {
            onMove(index, direction);
          }}
          onRemove={() => {
            onRemove(block.id);
          }}
        >
          <BlockRenderer block={block} disabled={disabled} onRichTextChange={onRichTextChange} />
        </BlockCard>
      ))}
      <div className="pt-2">
        <p className="mb-2 text-xs text-gray-600">Add a block to the end of the lesson</p>
        <AddBlockMenu disabled={disabled} onAdd={onAdd} />
      </div>
    </section>
  );
}
