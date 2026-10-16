import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useSession } from '@/features/auth/queries';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, type NavItem } from '../nav';
import { ChevronDown } from 'lucide-react';

const itemClass =
  'flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-4 focus-visible:ring-ring/40';

function isCurrent(pathname: string, to?: string) {
  return to !== undefined && (pathname === to || pathname.startsWith(`${to}/`));
}

function SidebarItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  if (!item.to) {
    return (
      <span aria-disabled="true" className={cn(itemClass, 'cursor-not-allowed text-gray-400')}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          itemClass,
          isActive ? 'bg-white font-semibold shadow-md' : 'text-gray-900 hover:bg-gray-100',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

export function AdminSidebar() {
  const { pathname } = useLocation();
  const profile = useSession();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="bg-gray-50 lg:w-64 lg:shrink-0">
      <div className="flex flex-col gap-3 p-4 lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <Logo accent="teal" />
          {/* Mobile only: compact sign out in the top row */}
          <LogoutButton className="lg:hidden" />
        </div>
        {/* Mobile: one horizontally scrollable row. Desktop: vertical, collapsible groups. */}
        <nav
          aria-label="Admin"
          className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-2 lg:flex-col lg:overflow-visible"
        >
          {ADMIN_NAV.map((group) => {
            const hasCurrent = group.items.some((item) => isCurrent(pathname, item.to));
            // The group holding the current page never collapses, so it stays visible.
            const isCollapsed = !hasCurrent && collapsed.has(group.id);
            const panelId = `admin-nav-${group.id}`;

            return (
              <div key={group.id} className="contents lg:block">
                {group.label && (
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-controls={panelId}
                    disabled={hasCurrent}
                    onClick={() => {
                      toggle(group.id);
                    }}
                    className="hidden w-full items-center justify-between rounded-lg px-4 pt-4 pb-1 text-[10px] font-semibold text-gray-600 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 lg:flex"
                  >
                    {group.label}
                    <ChevronDown
                      className={cn('size-3 transition-transform', isCollapsed && '-rotate-90')}
                      aria-hidden="true"
                    />
                  </button>
                )}
                {/* `contents` on mobile keeps items flat in the scroll row; collapse is desktop-only. */}
                <div
                  id={panelId}
                  className={cn(
                    'contents',
                    isCollapsed ? 'lg:hidden' : 'lg:flex lg:flex-col lg:gap-1',
                  )}
                >
                  {group.items.map((item) => (
                    <SidebarItem key={item.label} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden rounded-3xl bg-coral-700 p-4 text-white lg:mt-auto lg:block">
          <p className="text-[11px]">Signed in as</p>
          <p className="text-sm font-semibold">{profile?.name}</p>
          <p className="text-[11px] capitalize">{profile?.roleKey}</p>
          <LogoutButton className="mt-3 w-full" />
        </div>
      </div>
    </aside>
  );
}
