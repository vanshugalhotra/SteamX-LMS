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
        <Menu.Positioner side="bottom" align="center" sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-44 rounded-xl border border-brand-line bg-white p-1.5 text-brand-navy shadow-lg outline-none">
            {items.map(({ type, label: itemLabel, icon: Icon, create }) => (
              <Menu.Item
                key={type}
                onClick={() => {
                  onSelect(create);
                }}
                className="flex h-9 cursor-default items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none data-highlighted:bg-brand-chip"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {itemLabel}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
