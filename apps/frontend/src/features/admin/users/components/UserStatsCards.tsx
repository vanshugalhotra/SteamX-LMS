import type { ReactNode } from 'react';
import { StatsCard } from '@/components/ui/stats-card';
import { useSchools } from '../../schools/queries';
import type { UserRoleKey, UserStatusFilter } from '../model/types';
import { useUsers } from '../queries';

// `limit: 1` keeps the payload tiny; only `total` is used.
const params = (role: UserRoleKey, status: UserStatusFilter) => ({
  page: 1,
  limit: 1,
  q: '',
  role,
  status,
});

interface UserStatsCardsProps {
  role: UserRoleKey;
  plural: string;
  /** Extra cards rendered after "Schools" (e.g. teacher-only placeholders). */
  children?: ReactNode;
}

export function UserStatsCards({ role, plural, children }: UserStatsCardsProps) {
  const all = useUsers(params(role, 'ALL'));
  const active = useUsers(params(role, 'ACTIVE'));
  const inactive = useUsers(params(role, 'INACTIVE'));
  const schools = useSchools({ page: 1, limit: 1, q: '', status: 'ALL' });

  const label = plural.charAt(0).toUpperCase() + plural.slice(1);
  const columns = children
    ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
    : 'grid-cols-2 lg:grid-cols-4';

  return (
    <section aria-label={`${label} overview`} className={`grid gap-3 ${columns}`}>
      <StatsCard
        label={`Total ${plural}`}
        value={all.data?.total}
        isPending={all.isPending}
        tone="coral"
      />
      <StatsCard
        label={`Active ${plural}`}
        value={active.data?.total}
        isPending={active.isPending}
        tone="teal"
      />
      <StatsCard
        label={`Inactive ${plural}`}
        value={inactive.data?.total}
        isPending={inactive.isPending}
        tone="rose"
      />
      <StatsCard
        label="Schools"
        value={schools.data?.total}
        isPending={schools.isPending}
        tone="yellow"
      />
      {children}
    </section>
  );
}
