import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { COLUMN_ADDABLE_BLOCKS } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';
import { BlockCard } from './BlockCard';
import { BlockTypeMenu } from './BlockTypeMenu';

type ColumnIndex = 0 | 1;

export function TwoColumnBlockEditor({
  block,
  disabled,
  full,
  renderBlock,
  onAdd,
  onRemove,
}: {
  block: LessonContentBlock;
  disabled: boolean;
  full: boolean;
  renderBlock: (child: LessonContentBlock, column: ColumnIndex) => ReactNode;
  onAdd: (parentId: string, column: ColumnIndex, child: LessonContentBlock) => void;
  onRemove: (id: string) => void;
}) {
  const columns = block.columns ?? [null, null];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {([0, 1] as const).map((column) => {
          const child = columns[column];
          const columnLabel = `Column ${String(column + 1)}`;

          return (
            <section
              key={column}
              aria-label={columnLabel}
              className="min-w-0 space-y-3 rounded-2xl border border-dashed border-brand-line p-3"
            >
              <h3 className="text-xs font-medium text-gray-600">{columnLabel}</h3>
              {child && (
                <BlockCard
                  type={child.type}
                  index={0}
                  count={1}
                  disabled={disabled}
                  nested
                  contextLabel={columnLabel.toLowerCase()}
                  onRemove={() => {
                    onRemove(child.id);
                  }}
                >
                  {renderBlock(child, column)}
                </BlockCard>
              )}
              {!child && (
                <BlockTypeMenu
                  items={COLUMN_ADDABLE_BLOCKS}
                  disabled={disabled || full}
                  label={`Add block to ${columnLabel.toLowerCase()}`}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-line text-xs font-medium text-gray-600 outline-none hover:bg-brand-side focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  onSelect={(create) => {
                    onAdd(block.id, column, create());
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add block to {columnLabel.toLowerCase()}
                </BlockTypeMenu>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-gray-600">
        Columns hold text, image, video, PDF, and accordion blocks. Layouts can’t be nested.
      </p>
    </div>
  );
}
