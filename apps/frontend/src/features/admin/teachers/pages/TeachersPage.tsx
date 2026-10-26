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
  getTeacherColumns,
  TEACHER_STATUS_FILTERS,
  TEACHERS_PAGE_SIZE,
  TEACHERS_SEARCH_MAX_LENGTH,
} from '../config/teachers.config';
import { TeacherStatsCards } from '../components/TeacherStatsCards';

export function TeachersPage() {
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
    limit: TEACHERS_PAGE_SIZE,
    q,
    role: 'teacher',
    status: filter,
    schoolId: schoolId || undefined,
  });
  const schoolNames = useSchoolNames();
  const columns = getTeacherColumns((id) => (id ? (schoolNames.get(id) ?? '-') : '-'));

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SteamX ID or email"
          label="Search teachers"
          maxLength={TEACHERS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Teachers</h1>
          <p className="mt-1 text-xs text-gray-600">
            Manage teacher profiles and school assignments.
          </p>
        </div>
        <ButtonLink to={PATHS.admin.teacherNew}>
          <Plus className="size-4" aria-hidden="true" />
          Add teacher
        </ButtonLink>
      </div>

      <TeacherStatsCards />

      <div className="flex flex-wrap items-center gap-2">
        <ListToolbar
          variant="segmented"
          filters={TEACHER_STATUS_FILTERS}
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
          getRowId={(teacher) => teacher.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No teachers match your filters."
          errorMessage="We couldn't load the teachers. Please try again."
          loadingLabel="Loading teachers"
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
