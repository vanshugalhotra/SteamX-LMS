import { StatsCard } from '@/components/ui/stats-card';
import { useSchools } from '../../schools/queries';
import type { UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';

// `limit: 1` keeps the payload tiny; only `total` is used.
const teachers = (status: UserStatusFilter) => ({
  page: 1,
  limit: 1,
  q: '',
  role: 'teacher' as const,
  status,
});

export function TeacherStatsCards() {
  const all = useUsers(teachers('ALL'));
  const active = useUsers(teachers('ACTIVE'));
  const inactive = useUsers(teachers('INACTIVE'));
  const schools = useSchools({ page: 1, limit: 1, q: '', status: 'ALL' });

  return (
    <section
      aria-label="Teachers overview"
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5"
    >
      <StatsCard
        label="Total teachers"
        value={all.data?.total}
        isPending={all.isPending}
        tone="coral"
      />
      <StatsCard
        label="Active teachers"
        value={active.data?.total}
        isPending={active.isPending}
        tone="teal"
      />
      <StatsCard
        label="Inactive teachers"
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
      {/* TODO: placeholder until the CourseDeliveries API provides this count. */}
      <StatsCard label="Delivery assignments" hint="Placeholder data" value={12} tone="plain" />
    </section>
  );
}
