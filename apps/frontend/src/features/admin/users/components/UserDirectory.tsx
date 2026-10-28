import { DirectoryList } from '@/components/list/DirectoryList';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { Pagination } from '@/components/ui/pagination';
import { useListParams } from '@/lib/use-list-params';
import { useSchoolNames } from '../../schools/queries';
import type { UserListItem, UserRoleKey, UserStatusFilter } from '../model/types';
import { useUsers } from '../queries';
import { UserStatusBadge } from './UserStatusBadge';

export const USER_STATUS_FILTERS = (
  plural: string,
): { value: UserStatusFilter; label: string }[] => [
  { value: 'ALL', label: `All ${plural}` },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

interface UserDirectoryProps {
  role: UserRoleKey;
  /** e.g. "teacher": used for titles and messages. */
  singular: string;
  plural: string;
  pageSize: number;
  searchMaxLength: number;
  editPath: (id: string) => string;
  currentId?: string;
}

export function UserDirectory({
  role,
  singular,
  plural,
  pageSize,
  searchMaxLength,
  editPath,
  currentId,
}: UserDirectoryProps) {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<UserStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useUsers({
    page,
    limit: pageSize,
    q,
    role,
    status: filter,
  });
  const schoolNames = useSchoolNames();
  const titleId = `${singular}-directory-title`;

  const toCard = (u: UserListItem) => ({
    id: u.id,
    title: u.name,
    subtitle: (
      <>
        <span className="font-semibold text-foreground">{u.steamxId}</span>
        {' · '}
        {u.schoolId ? (schoolNames.get(u.schoolId) ?? '-') : '-'}
      </>
    ),
    badge: <UserStatusBadge status={u.status} />,
    to: editPath(u.id),
  });

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 shrink-0">
          <h2 id={titleId} className="text-lg font-semibold capitalize">
            {singular} Directory
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">Search and browse registered {plural}.</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={`Search ${plural} by name or SteamX ID...`}
            label={`Search ${plural}`}
            maxLength={searchMaxLength}
          />
          <ListToolbar
            variant="segmented"
            filters={USER_STATUS_FILTERS(plural)}
            filter={filter}
            onFilterChange={setFilter}
            filterLabel="Filter by status"
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
          emptyMessage={`No ${plural} match your filters.`}
          errorMessage={`We couldn't load the ${plural}. Please try again.`}
          loadingLabel={`Loading ${plural}`}
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
