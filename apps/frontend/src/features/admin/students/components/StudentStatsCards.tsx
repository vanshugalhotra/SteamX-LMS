import { StatsCard } from '@/components/ui/stats-card';
import { useSchools } from '../../schools/queries';
import type { UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';

// `limit: 1` keeps the payload tiny; only `total` is used.
const students = (status: UserStatusFilter) => ({
  page: 1,
  limit: 1,
  q: '',
  role: 'student' as const,
  status,
});

export function StudentStatsCards() {
  const all = useUsers(students('ALL'));
  const active = useUsers(students('ACTIVE'));
  const inactive = useUsers(students('INACTIVE'));
  const schools = useSchools({ page: 1, limit: 1, q: '', status: 'ALL' });

  return (
    <section aria-label="Students overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatsCard
        label="Total students"
        value={all.data?.total}
        isPending={all.isPending}
        tone="coral"
      />
      <StatsCard
        label="Active students"
        value={active.data?.total}
        isPending={active.isPending}
        tone="teal"
      />
      <StatsCard
        label="Inactive students"
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
    </section>
  );
}
