import { Plus } from 'lucide-react';
import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { ButtonLink } from '@/components/ui/button-link';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { AsyncSelect } from '@/components/ui/async-select';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import { useAnySchoolSearch, useSchoolNames } from '../../schools/queries';
import type { UserStatusFilter } from '../../users/model/types';
import { useUsers } from '../../users/queries';
import {
  getStudentColumns,
  STUDENT_STATUS_FILTERS,
  STUDENTS_PAGE_SIZE,
  STUDENTS_SEARCH_MAX_LENGTH,
} from '../config/students.config';
import { UserStatsCards } from '../../users/components/UserStatsCards';

export function StudentsPage() {
  const {
    search,
    setSearch,
    filter,
    setFilter,
    secondary: schoolId,
    setSecondary: setSchoolId,
    q,
    page,
    setPage,
  } = useListParams<UserStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useUsers({
    page,
    limit: STUDENTS_PAGE_SIZE,
    q,
    role: 'student',
    status: filter,
    schoolId: schoolId || undefined,
  });
  const schoolNames = useSchoolNames();
  const columns = getStudentColumns((id) => (id ? (schoolNames.get(id) ?? '-') : '-'));

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SteamX ID or email"
          label="Search students"
          maxLength={STUDENTS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Students</h1>
          <p className="mt-1 text-xs text-gray-600">
            Manage student profiles, schools and classes.
          </p>
        </div>
        <ButtonLink to={PATHS.admin.studentNew}>
          <Plus className="size-4" aria-hidden="true" />
          Add Student
        </ButtonLink>
      </div>

      <UserStatsCards role="student" plural="students" />

      <div className="flex flex-wrap items-center gap-2">
        <ListToolbar
          variant="segmented"
          filters={STUDENT_STATUS_FILTERS}
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Filter by status"
        />
        <div className="w-full sm:max-w-64">
          <AsyncSelect
            aria-label="Filter by school"
            value={schoolId}
            onChange={setSchoolId}
            useSearch={useAnySchoolSearch}
            placeholder="All schools"
          />
        </div>
      </div>

      <section className="rounded-2xl bg-gray-50 p-2">
        <DataTable
          columns={columns}
          rows={data?.items}
          getRowId={(student) => student.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No students match your filters."
          errorMessage="We couldn't load the students. Please try again."
          loadingLabel="Loading students"
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
