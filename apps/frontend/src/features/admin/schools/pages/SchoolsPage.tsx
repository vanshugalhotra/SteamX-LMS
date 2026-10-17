import { useState, useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
import type { School, SchoolStatus } from '../api/api';
import { SchoolDrawer } from '../components/SchoolDrawer';
import { SchoolList } from '../components/SchoolList';
import { useSchools } from '../queries';

const PAGE_SIZE = 10;

const FILTERS: { value: SchoolStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

type DrawerState = { school?: School } | null;

export function SchoolsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SchoolStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const openDrawer = (state: DrawerState) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setDrawer(state);
  };
  const closeDrawer = () => {
    setDrawer(null);
    triggerRef.current?.focus();
  };

  const q = useDebouncedValue(search.trim());
  const { data, isPending, isError, refetch } = useSchools({
    page,
    limit: PAGE_SIZE,
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
            openDrawer({});
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
              setPage(1);
            }}
            placeholder="Search by name or code"
            aria-label="Search schools"
            className="w-full min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-gray-600"
          />
          <Search className="size-4 shrink-0" aria-hidden="true" />
        </label>

        <div role="group" aria-label="Filter by status" className="flex gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
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
        <SchoolList
          schools={data?.items}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          onEdit={(school) => {
            openDrawer({ school });
          }}
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
          onClose={closeDrawer}
        />
      )}
    </>
  );
}
