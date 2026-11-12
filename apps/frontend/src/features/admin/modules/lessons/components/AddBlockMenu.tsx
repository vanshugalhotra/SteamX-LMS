import { Plus } from 'lucide-react';
import { ADDABLE_BLOCKS } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';
import { BlockTypeMenu } from './BlockTypeMenu';

export function AddBlockMenu({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (block: LessonContentBlock) => void;
}) {
  return (
    <div className="flex justify-center">
      <BlockTypeMenu
        items={ADDABLE_BLOCKS}
        disabled={disabled}
        label="Add a block"
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-line bg-white px-4 text-sm font-medium text-brand-navy outline-none hover:border-primary hover:bg-brand-side focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        onSelect={(create) => {
          onAdd(create());
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add a block
      </BlockTypeMenu>
    </div>
  );
}
