import { Plus } from 'lucide-react';
import { ADDABLE_BLOCKS } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';
import { BlockTypeMenu } from './BlockTypeMenu';

export function BlockInsertDivider({
  disabled,
  position,
  onInsert,
}: {
  disabled: boolean;
  position: number;
  onInsert: (block: LessonContentBlock) => void;
}) {
  return (
    <div className="group relative flex h-7 items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-primary/50 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
      <BlockTypeMenu
        items={ADDABLE_BLOCKS}
        disabled={disabled}
        label={`Insert block before block ${String(position)}`}
        className="relative grid size-6 place-items-center rounded-full border border-brand-line bg-white text-gray-600 outline-none hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-primary data-popup-open:bg-primary data-popup-open:text-primary-foreground disabled:opacity-50"
        onSelect={(create) => {
          onInsert(create());
        }}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </BlockTypeMenu>
    </div>
  );
}
