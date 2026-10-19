import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
import type { School, SchoolStatusFilter } from '../model/types';
import { SchoolDrawer } from '../components/SchoolDrawer';
import { DataTable } from '@/components/ui/data-table';
import { getSchoolColumns } from '../components/schoolColumns';
import { useSchools } from '../queries';
import { SCHOOLS_PAGE_SIZE, SCHOOL_STATUS_FILTERS } from '../model/config';

type DrawerState = { school?: School } | null;

export function SchoolsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SchoolStatusFilter>('ALL');
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const columns = getSchoolColumns((school) => {
    setDrawer({ school });
  });

  const q = useDebouncedValue(search.trim());
  const filterKey = `${q}|${status}`;

  // The page belongs to the filters it was chosen for; new filters mean page 1.
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) => {
    setPageState({ key: filterKey, page: next });
  };

  const { data, isPending, isError, refetch } = useSchools({
    page,
    limit: SCHOOLS_PAGE_SIZE,
    q,
    status,
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="mt-1 text-xs text-gray-600">Create schools and edit their details.</p>
        </div>
        <Button
          onClick={() => {
            setDrawer({});
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add school
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex max-w-xs min-w-0 flex-1 items-center gap-2 rounded-full bg-gray-100 px-5 py-3 text-gray-600 focus-within:ring-4 focus-within:ring-ring/40">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search by name or code"
            aria-label="Search schools"
            className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-gray-400"
          />
          <Search className="size-4 shrink-0" aria-hidden="true" />
        </label>

        <div role="group" aria-label="Filter by status" className="flex gap-2">
          {SCHOOL_STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
              }}
              className={cn(
                'rounded-full px-4 py-2 text-[11px] font-medium outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
                status === filter.value ? 'bg-gray-900 text-white' : 'bg-gray-100',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-6 rounded-2xl bg-gray-50 p-2">
        <DataTable
          columns={columns}
          rows={data?.items}
          getRowId={(school) => school.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No schools match your filters."
          errorMessage="We couldn't load the schools. Please try again."
          loadingLabel="Loading schools"
        />
        {data && data.total > 0 && (
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </section>

      {drawer && (
        <SchoolDrawer
          key={drawer.school?.id ?? 'new'}
          school={drawer.school}
          onClose={() => {
            setDrawer(null);
          }}
        />
      )}
    </>
  );
}
