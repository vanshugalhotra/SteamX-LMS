import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { DirectoryList } from '@/components/list/DirectoryList';
import { Pagination } from '@/components/ui/pagination';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import { useSchoolNames } from '../../schools/queries';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import type { UserListItem, UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';
import {
  TEACHER_STATUS_FILTERS,
  TEACHERS_PAGE_SIZE,
  TEACHERS_SEARCH_MAX_LENGTH,
} from '../config/teachers.config';

export function TeacherDirectory({ currentId }: { currentId?: string }) {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<UserStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useUsers({
    page,
    limit: TEACHERS_PAGE_SIZE,
    q,
    role: 'teacher',
    status: filter,
  });
  const schoolNames = useSchoolNames();

  const toCard = (t: UserListItem) => ({
    id: t.id,
    title: t.name,
    subtitle: (
      <>
        <span className="font-semibold text-foreground">{t.steamxId}</span>
        {' · '}
        {t.schoolId ? (schoolNames.get(t.schoolId) ?? '-') : '-'}
      </>
    ),
    badge: <UserStatusBadge status={t.status} />,
    to: PATHS.admin.teacherEdit(t.id),
  });

  return (
    <section
      aria-labelledby="teacher-directory-title"
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 shrink-0">
          <h2 id="teacher-directory-title" className="text-lg font-semibold">
            Teacher Directory
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">Search and browse registered teachers.</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search teachers by name or SteamX ID..."
            label="Search teachers"
            maxLength={TEACHERS_SEARCH_MAX_LENGTH}
          />
          <ListToolbar
            variant="segmented"
            filters={TEACHER_STATUS_FILTERS}
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
          emptyMessage="No teachers match your filters."
          errorMessage="We couldn't load the teachers. Please try again."
          loadingLabel="Loading teachers"
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
