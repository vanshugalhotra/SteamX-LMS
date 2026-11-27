import { ClipboardList } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { useSession } from '@/features/auth/queries';
import { cn } from '@/lib/utils';
import { PATHS } from '@/lib/paths';

const linkClass =
  'flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/40';

export function TeacherSidebar() {
  const profile = useSession();

  return (
    <aside className="bg-gray-50 lg:w-64 lg:shrink-0">
      <div className="flex flex-col gap-3 p-4 lg:sticky lg:top-0 lg:h-svh lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <Link to={PATHS.teacher.deliveries} aria-label="Teacher home">
            <Logo accent="teal" variant="compact" />
          </Link>
          <LogoutButton className="lg:hidden" />
        </div>
        <nav
          aria-label="Teacher"
          className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-2 lg:flex-col lg:overflow-visible"
        >
          <NavLink
            to={PATHS.teacher.deliveries}
            className={({ isActive }) =>
              cn(
                linkClass,
                isActive
                  ? 'bg-white font-semibold shadow-md'
                  : 'text-gray-900 hover:bg-teal-100 hover:text-teal-900',
              )
            }
          >
            <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
            My Deliveries
          </NavLink>
        </nav>
        <div className="hidden rounded-3xl bg-coral-500 p-4 text-brand-navy lg:mt-auto lg:block">
          <p className="text-[11px]">Signed in as</p>
          <p className="text-sm font-semibold">{profile?.name}</p>
          <p className="text-[11px] capitalize">{profile?.roleKey}</p>
          <LogoutButton className="mt-3 w-full" />
        </div>
      </div>
    </aside>
  );
}
