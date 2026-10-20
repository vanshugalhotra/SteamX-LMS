import { Plus } from 'lucide-react';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { ButtonLink } from '@/components/ui/button-link';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useListParams } from '@/lib/use-list-params';
import { PATHS } from '@/lib/paths';
import { SchoolStatsCards } from '../components/SchoolStatsCards';
import { SCHOOL_STATUS_FILTERS, SCHOOLS_PAGE_SIZE, schoolColumns, SCHOOLS_SEARCH_MAX_LENGTH } from '../config/schools.config';
import type { SchoolStatusFilter } from '../model/types';
import { useSchools } from '../queries';
import { HeaderSlot } from '../../components/HeaderSlot';

export function SchoolsPage() {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<SchoolStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useSchools({
    page,
    limit: SCHOOLS_PAGE_SIZE,
    q,
    status: filter,
  });

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name or code"
          label="Search schools"
          maxLength={SCHOOLS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="mt-1 text-xs text-gray-600">Create schools and edit their details.</p>
        </div>
        <ButtonLink to={PATHS.admin.schoolNew}>
          <Plus className="size-4" aria-hidden="true" />
          Add school
        </ButtonLink>
      </div>

      <SchoolStatsCards />

      <ListToolbar
        filters={SCHOOL_STATUS_FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter by account status"
      />

      <section className="rounded-2xl bg-gray-50 p-2">
        <DataTable
          columns={schoolColumns}
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
    </div>
  );
}
