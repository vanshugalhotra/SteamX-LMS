import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useListParams } from '@/lib/use-list-params';
import { USER_STATUS_FILTERS } from '../../users/components/UserDirectory';
import type { UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';
import { adminColumns, ADMINS_PAGE_SIZE, ADMINS_SEARCH_MAX_LENGTH } from '../config/admins.config';

export function AdminsPage() {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<UserStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useUsers({
    page,
    limit: ADMINS_PAGE_SIZE,
    q,
    role: 'admin',
    status: filter,
  });

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SteamX ID or email"
          label="Search admins"
          maxLength={ADMINS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>
      <div>
        <h1 className="text-2xl font-semibold">Admins</h1>
        {/* TODO: add "Add admin" and edit once the backend has an admin create endpoint
        (POST /users only supports teachers and students; PLATFORM_STAFF accounts return
        USER_NOT_MANAGEABLE on PATCH). */}
        <p className="mt-1 text-xs text-gray-600">
          Platform administrators. Adding admins is not available yet.
        </p>
      </div>
      <ListToolbar
        variant="segmented"
        filters={USER_STATUS_FILTERS('admins')}
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter by status"
      />
      <section className="rounded-2xl bg-gray-50 p-2">
        <DataTable
          columns={adminColumns}
          rows={data?.items}
          getRowId={(a) => a.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No admins match your filters."
          errorMessage="We couldn't load the admins. Please try again."
          loadingLabel="Loading admins"
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
