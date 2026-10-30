import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useSession } from '@/features/auth/queries';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, type NavChild, type NavItem } from '../nav';
import { ChevronDown } from 'lucide-react';

const itemClass =
  'flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-[background-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:ring-4 focus-visible:ring-ring/40';

function matches(pathname: string, to?: string) {
  return to !== undefined && (pathname === to || pathname.startsWith(`${to}/`));
}

/** An item is active on its own path, its children's paths and their sub-paths. */
function isItemActive(pathname: string, item: NavItem) {
  return (
    matches(pathname, item.to) || (item.children?.some((c) => matches(pathname, c.to)) ?? false)
  );
}

/** The most specific child wins, so /schools/new highlights "Add school", not "All schools". */
function activeChild(pathname: string, children: NavChild[]) {
  return children
    .filter((c) => matches(pathname, c.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function SidebarItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isItemActive(pathname, item);
  const [open, setOpen] = useState(false);
  const expanded = active || open;

  if (!item.to) {
    return (
      <span aria-disabled="true" className={cn(itemClass, 'cursor-not-allowed text-gray-400')}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {item.label}
      </span>
    );
  }

  const current = item.children ? activeChild(pathname, item.children) : undefined;
  const panelId = `nav-sub-${item.label}`;

  return (
    <div className="contents lg:block">
      <div className="flex shrink-0 items-center">
        <NavLink
          to={item.to}
          className={cn(
            itemClass,
            'flex-1',
            active
              ? 'bg-white font-semibold shadow-md'
              : 'text-gray-900 hover:scale-[1.02] hover:bg-teal-100 hover:text-teal-900',
          )}
          aria-current={active && !item.children ? 'page' : undefined}
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
        {item.children && (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            disabled={active}
            onClick={() => {
              setOpen((o) => !o);
            }}
            className="ml-1 hidden size-8 shrink-0 place-items-center rounded-lg text-gray-600 outline-none hover:bg-gray-100 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-40 lg:grid"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', !expanded && '-rotate-90')}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {item.children && expanded && (
        <ul
          id={panelId}
          className="mt-1 mb-1 ml-6 hidden space-y-0.5 border-l border-gray-200 pl-3 lg:block"
        >
          {item.children.map((child) => {
            const isCurrent = current?.to === child.to;
            return (
              <li key={child.to}>
                <Link
                  to={child.to}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm outline-none transition-[background-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:ring-4 focus-visible:ring-ring/40',
                    isCurrent
                      ? 'bg-teal-100 font-semibold text-teal-900'
                      : 'text-gray-600 hover:scale-[1.02] hover:bg-teal-100 hover:text-teal-900',
                  )}
                >
                  <child.icon className="size-3.5 shrink-0" aria-hidden="true" />
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
          <Logo accent="teal" variant="compact" />
          {/* Mobile only: compact sign out in the top row */}
          <LogoutButton className="lg:hidden" />
        </div>
        {/* Mobile: one horizontally scrollable row. Desktop: vertical, collapsible groups. */}
        <nav
          aria-label="Admin"
          className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-2 lg:flex-col lg:overflow-visible"
        >
          {ADMIN_NAV.map((group) => {
            const hasCurrent = group.items.some((item) => isItemActive(pathname, item));
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
                    <SidebarItem key={item.label} item={item} pathname={pathname} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden rounded-3xl bg-coral-500 p-4 text-white lg:mt-auto lg:block">
          <p className="text-[11px]">Signed in as</p>
          <p className="text-sm font-semibold">{profile?.name}</p>
          <p className="text-[11px] capitalize">{profile?.roleKey}</p>
          <LogoutButton className="mt-3 w-full" />
        </div>
      </div>
    </aside>
  );
}
