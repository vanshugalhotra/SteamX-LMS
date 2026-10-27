import { DirectoryList } from '@/components/list/DirectoryList';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { Pagination } from '@/components/ui/pagination';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import { useSchoolNames } from '../../schools/queries';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import type { UserListItem, UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';
import {
  STUDENT_STATUS_FILTERS,
  STUDENTS_PAGE_SIZE,
  STUDENTS_SEARCH_MAX_LENGTH,
} from '../config/students.config';

export function StudentDirectory({ currentId }: { currentId?: string }) {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<UserStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useUsers({
    page,
    limit: STUDENTS_PAGE_SIZE,
    q,
    role: 'student',
    status: filter,
  });
  const schoolNames = useSchoolNames();

  const toCard = (s: UserListItem) => ({
    id: s.id,
    title: s.name,
    subtitle: (
      <>
        <span className="font-semibold text-foreground">{s.steamxId}</span>
        {' · '}
        {s.schoolId ? (schoolNames.get(s.schoolId) ?? '-') : '-'}
      </>
    ),
    badge: <UserStatusBadge status={s.status} />,
    to: PATHS.admin.studentEdit(s.id),
  });

  return (
    <section
      aria-labelledby="student-directory-title"
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 shrink-0">
          <h2 id="student-directory-title" className="text-lg font-semibold">
            Student Directory
          </h2>
          <p className="mt-0.5 text-xs text-gray-600">Search and browse registered students.</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search students by name or SteamX ID..."
            label="Search students"
            maxLength={STUDENTS_SEARCH_MAX_LENGTH}
          />
          <ListToolbar
            variant="segmented"
            filters={STUDENT_STATUS_FILTERS}
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
          emptyMessage="No students match your filters."
          errorMessage="We couldn't load the students. Please try again."
          loadingLabel="Loading students"
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
