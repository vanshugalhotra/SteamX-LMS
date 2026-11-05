import { Menu } from '@base-ui/react/menu';
import { Ellipsis } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        type="button"
        aria-label={label}
        className="grid size-8 shrink-0 place-items-center rounded-full text-brand-navy outline-none hover:bg-brand-chip focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <Ellipsis className="size-5" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-44 rounded-xl border border-brand-line bg-white p-1.5 text-brand-navy shadow-lg outline-none">
            {actions.map(({ label: actionLabel, icon: Icon, disabled, danger, onSelect }) => (
              <Menu.Item
                key={actionLabel}
                disabled={disabled}
                onClick={onSelect}
                className={`flex h-9 cursor-default items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none data-[highlighted]:bg-brand-chip data-[disabled]:opacity-50 ${
                  danger ? 'text-danger' : 'text-brand-navy'
                }`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {actionLabel}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
