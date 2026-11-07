// TODO(follow-up): add IMAGE, VIDEO, PDF, ACCORDION and TWO_COLUMN once their editors exist.

import { BLOCK_META } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';

const ADDABLE = ['RICH_TEXT'] as const;

export function AddBlockMenu({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (block: LessonContentBlock) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {ADDABLE.map((type) => {
        const meta = BLOCK_META[type];
        if (!meta?.create) return null;
        const Icon = meta.icon;
        const create = meta.create;
        return (
          <button
            key={type}
            type="button"
            aria-label={`Add ${meta.label.toLowerCase()} block`}
            disabled={disabled}
            onClick={() => {
              onAdd(create());
            }}
            className="grid w-24 justify-items-center gap-1.5 rounded-2xl border-2 border-dashed border-brand-line px-2 py-3 text-xs font-medium text-brand-navy outline-none hover:bg-brand-side focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-teal-50">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
