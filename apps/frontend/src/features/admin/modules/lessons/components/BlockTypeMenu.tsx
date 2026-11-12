import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { AddableBlock } from '../model/blocks';

export function BlockTypeMenu({
  items,
  disabled,
  label,
  className,
  onSelect,
  children,
}: {
  items: readonly AddableBlock[];
  disabled: boolean;
  label: string;
  className: string;
  onSelect: (create: AddableBlock['create']) => void;
  children: ReactNode;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger type="button" disabled={disabled} aria-label={label} className={className}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="center"
          sideOffset={8}
          className="z-50 max-w-[calc(100vw-1.5rem)]"
        >
          <Menu.Popup className="grid w-[min(38rem,calc(100vw-1.5rem))] grid-cols-3 gap-2 rounded-2xl border border-brand-line bg-white p-3 text-brand-navy shadow-xl outline-none sm:grid-cols-6 sm:p-4">
            {items.map(({ type, label: itemLabel, icon: Icon, create }) => (
              <Menu.Item
                key={type}
                onClick={() => {
                  onSelect(create);
                }}
                className="flex min-h-20 cursor-default flex-col items-center justify-center gap-2 rounded-xl px-1.5 py-2 text-center text-xs font-medium outline-none data-highlighted:bg-brand-side data-highlighted:ring-2 data-highlighted:ring-primary/30"
              >
                <span
                  className={`grid size-10 place-items-center rounded-xl ${
                    type === 'RICH_TEXT'
                      ? 'bg-gray-100'
                      : type === 'ACCORDION'
                        ? 'bg-teal-100'
                        : type === 'IMAGE'
                          ? 'bg-rose-100'
                          : type === 'VIDEO'
                            ? 'bg-pink-100'
                            : type === 'PDF'
                              ? 'bg-amber-100'
                              : 'bg-indigo-100'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {itemLabel}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
