import { useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import type { Asset } from '@/features/admin/assets/model/types';
import { LESSON_MAX_BLOCKS } from '../config/lessons.config';
import { countBlocks, type BlockTextField } from '../model/blocks';
import type { LessonContent, LessonContentBlock } from '../model/types';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockCard } from './BlockCard';
import { BlockInsertDivider } from './BlockInsertDivider';
import { BlockRenderer } from './BlockRenderer';

export function BlockList({
  blocks,
  assets,
  incompleteIds,
  invalidAccordionIds,
  disabled,
  onAdd,
  onMove,
  onReorder,
  onRemove,
  onRichTextChange,
  onAttachAsset,
  onFieldChange,
  onAccordionTitleChange,
  onAddColumnBlock,
}: {
  blocks: LessonContentBlock[];
  assets: LessonContent['assets'];
  incompleteIds: string[];
  invalidAccordionIds: string[];
  disabled: boolean;
  onAdd: (block: LessonContentBlock, index?: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onRichTextChange: (id: string, doc: JSONContent) => void;
  onAttachAsset: (id: string, asset: Asset) => void;
  onFieldChange: (id: string, key: BlockTextField, value: string) => void;
  onAccordionTitleChange: (id: string, title: string) => void;
  onAddColumnBlock: (parentId: string, column: 0 | 1, block: LessonContentBlock) => void;
}) {
  const full = countBlocks(blocks) >= LESSON_MAX_BLOCKS;
  const addDisabled = disabled || full;
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  if (blocks.length === 0) {
    return (
      <section className="rounded-3xl border-2 border-dashed border-brand-line px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-brand-navy">This lesson is empty</h2>
        <p className="mx-auto mb-5 mt-1 max-w-sm text-xs leading-5 text-gray-600">
          Add your first block to introduce a topic, explain a concept, or share instructions.
        </p>
        <AddBlockMenu disabled={addDisabled} onAdd={onAdd} />
      </section>
    );
  }

  return (
    <section aria-label="Lesson content">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setDropTargetId((current) => (current === block.id ? null : current));
            }
          }}
          onDragOver={(event) => {
            if (draggedId === null || draggedId === block.id) return;
            event.preventDefault();
            setDropTargetId(block.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedId !== null) {
              const fromIndex = blocks.findIndex((item) => item.id === draggedId);
              if (fromIndex !== -1) onReorder(fromIndex, index);
            }
            setDraggedId(null);
            setDropTargetId(null);
          }}
        >
          {index > 0 && (
            <BlockInsertDivider
              disabled={addDisabled}
              position={index + 1}
              onInsert={(newBlock) => {
                onAdd(newBlock, index);
              }}
            />
          )}
          <BlockCard
            type={block.type}
            index={index}
            count={blocks.length}
            disabled={disabled}
            isDropTarget={dropTargetId === block.id}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', block.id);
              setDraggedId(block.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
            onMove={(direction) => {
              onMove(index, direction);
            }}
            onRemove={() => {
              onRemove(block.id);
            }}
          >
            <BlockRenderer
              block={block}
              index={index}
              full={full}
              assets={assets}
              incompleteIds={incompleteIds}
              invalidAccordionIds={invalidAccordionIds}
              disabled={disabled}
              onRichTextChange={onRichTextChange}
              onAttachAsset={onAttachAsset}
              onFieldChange={onFieldChange}
              onAccordionTitleChange={onAccordionTitleChange}
              onAddColumnBlock={onAddColumnBlock}
              onRemoveBlock={onRemove}
            />
          </BlockCard>
        </div>
      ))}
      <div className="pt-4">
        <p className="mb-2 text-xs text-gray-600">
          {full
            ? `A lesson can have up to ${String(LESSON_MAX_BLOCKS)} blocks.`
            : 'Add a block to the end of the lesson'}
        </p>
        <AddBlockMenu disabled={addDisabled} onAdd={onAdd} />
      </div>
    </section>
  );
}
