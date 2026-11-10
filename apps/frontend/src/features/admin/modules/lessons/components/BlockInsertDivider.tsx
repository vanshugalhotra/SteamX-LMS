import { Menu } from '@base-ui/react/menu';
import { Plus } from 'lucide-react';
import { ADDABLE_BLOCKS } from '../model/blocks';
import type { LessonContentBlock } from '../model/types';

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
      <Menu.Root>
        <Menu.Trigger
          type="button"
          disabled={disabled}
          aria-label={`Insert block before block ${String(position)}`}
          className="relative grid size-6 place-items-center rounded-full border border-brand-line bg-white text-gray-600 outline-none hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-primary data-popup-open:bg-primary data-popup-open:text-primary-foreground disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="center" sideOffset={4} className="z-50">
            <Menu.Popup className="min-w-44 rounded-xl border border-brand-line bg-white p-1.5 text-brand-navy shadow-lg outline-none">
              {ADDABLE_BLOCKS.map(({ type, label, icon: Icon, create }) => (
                <Menu.Item
                  key={type}
                  onClick={() => {
                    onInsert(create());
                  }}
                  className="flex h-9 cursor-default items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none data-highlighted:bg-brand-chip"
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
