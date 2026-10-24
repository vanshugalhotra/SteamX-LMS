import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { Pagination } from '@/components/ui/pagination';
import { useListParams } from '@/lib/use-list-params';
import {
  SCHOOL_STATUS_FILTERS,
  SCHOOLS_PAGE_SIZE,
  SCHOOLS_SEARCH_MAX_LENGTH,
} from '../config/schools.config';
import type { School, SchoolStatusFilter } from '../model/types';
import { useSchools } from '../queries';
import { DirectoryList } from '@/components/list/DirectoryList';
import { SchoolStatusBadge } from './SchoolStatusBadge';
import { PATHS } from '@/lib/paths';

/** Browse registered schools below the add/edit form (Edit opens that school). */
export function SchoolDirectory({ currentId }: { currentId?: string }) {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<SchoolStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useSchools({
    page,
    limit: SCHOOLS_PAGE_SIZE,
    q,
    status: filter,
  });

  const toCard = (s: School) => ({
    id: s.id,
    title: s.name,
    subtitle: (
      <>
        <span className="font-semibold text-foreground">{s.code}</span> · {s.city}, {s.state}
      </>
    ),
    badge: <SchoolStatusBadge status={s.status} />,
    to: PATHS.admin.schoolEdit(s.id),
  });

  return (
    <section
      aria-labelledby="school-directory-title"
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 shrink-0">
          <h2 id="school-directory-title" className="text-lg font-semibold">
            School Directory
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">Search and browse registered schools.</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search schools by name or code..."
            label="Search schools"
            maxLength={SCHOOLS_SEARCH_MAX_LENGTH}
          />
          <ListToolbar
            filters={SCHOOL_STATUS_FILTERS}
            filter={filter}
            onFilterChange={setFilter}
            filterLabel="Filter by account status"
            variant="segmented"
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-gray-50 p-3">
        <DirectoryList
          rows={data?.items}
          toCard={toCard}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No schools match your filters."
          errorMessage="We couldn't load the schools. Please try again."
          loadingLabel="Loading schools"
          currentId={currentId}
        />
        {data && data.total > 0 && (
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>
    </section>
  );
}
