import { Plus } from 'lucide-react';
import { SearchBox } from '@/components/list/ListToolbar';
import { AsyncSelect } from '@/components/ui/async-select';
import { ButtonLink } from '@/components/ui/button-link';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import { useAnySchoolSearch, useSchoolNames } from '../../schools/queries';
import {
  CLASS_SECTIONS_PAGE_SIZE,
  CLASS_SECTIONS_SEARCH_MAX_LENGTH,
  getClassSectionColumns,
} from '../config/class-sections.config';
import { useClassSections } from '../queries';

export function ClassSectionsPage() {
  const {
    search,
    setSearch,
    secondary: schoolId,
    setSecondary: setSchoolId,
    q,
    page,
    setPage,
  } = useListParams<'ALL'>('ALL');
  const { data, isPending, isError, refetch } = useClassSections({
    page,
    limit: CLASS_SECTIONS_PAGE_SIZE,
    q,
    schoolId,
  });
  const schoolNames = useSchoolNames();
  const columns = getClassSectionColumns((id) => schoolNames.get(id) ?? '-');

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by class or section"
          label="Search class sections"
          maxLength={CLASS_SECTIONS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Class sections</h1>
          <p className="mt-1 text-xs text-gray-600">
            Classes and sections students are assigned to.
          </p>
        </div>
        <ButtonLink to={PATHS.admin.classSectionNew}>
          <Plus className="size-4" aria-hidden="true" />
          Add class section
        </ButtonLink>
      </div>

      <div className="w-full sm:max-w-64">
        <AsyncSelect
          aria-label="Filter by school"
          value={schoolId}
          onChange={setSchoolId}
          useSearch={useAnySchoolSearch}
          placeholder="All schools"
        />
      </div>

      <section className="rounded-2xl bg-gray-50 p-2">
        <DataTable
          columns={columns}
          rows={data?.items}
          getRowId={(c) => c.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage="No class sections match your filters."
          errorMessage="We couldn't load the class sections. Please try again."
          loadingLabel="Loading class sections"
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
