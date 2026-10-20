import { StatsCard } from '@/components/ui/stats-card';
import { useSchools } from '../queries';

// `limit: 1` keeps the payload tiny; only `total` is used.
const count = (status: 'ALL' | 'ACTIVE') => ({ page: 1, limit: 1, q: '', status });

export function SchoolStatsCards() {
  const all = useSchools(count('ALL'));
  const active = useSchools(count('ACTIVE'));

  {
    /* TODO: placeholder values, replace with real counts once the API provides them. */
  }
  return (
    <section aria-label="Schools overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatsCard label="Schools" value={all.data?.total} isPending={all.isPending} tone="teal" />
      {/* TODO: placeholder values until the API provides counts. */}
      <StatsCard label="Teachers" value={1240} hint="Placeholder data" tone="yellow" />
      <StatsCard label="Students" value={36800} hint="Placeholder data" tone="coral" />
      <StatsCard
        label="Active schools"
        value={active.data?.total}
        isPending={active.isPending}
        tone="plain"
      />
    </section>
  );
}
