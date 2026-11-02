import { Plus } from 'lucide-react';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { ButtonLink } from '@/components/ui/button-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import {
  COURSE_STATUS_FILTERS,
  COURSES_PAGE_SIZE,
  COURSES_SEARCH_MAX_LENGTH,
} from '../config/courses.config';
import type { CourseStatusFilter } from '../model/types';
import { CourseCard } from '../components/CourseCard';
import { useCourses } from '../queries';

export function CoursesPage() {
  const { search, setSearch, filter, setFilter, q, page, setPage } =
    useListParams<CourseStatusFilter>('ALL');
  const { data, isPending, isError, refetch } = useCourses({
    page,
    limit: COURSES_PAGE_SIZE,
    q,
    status: filter === 'ALL' ? undefined : filter,
  });

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search courses"
          label="Search courses"
          maxLength={COURSES_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>
      <section className="relative overflow-hidden rounded-3xl bg-teal-500 px-6 py-7 text-indigo-950 sm:px-8 sm:py-8">
        <span
          aria-hidden="true"
          className="absolute -right-8 -top-10 size-44 rounded-full bg-coral-500"
        />
        <span
          aria-hidden="true"
          className="absolute right-24 top-16 size-20 rounded-full bg-yellow-400"
        />
        <div className="relative max-w-xl">
          <h1 className="text-2xl font-bold">Courses &amp; Lessons</h1>
          <p className="mt-1 text-sm">
            Choose a course to manage its details and build its curriculum.
          </p>
          <ButtonLink
            to={PATHS.admin.courseNew}
            className="mt-5 rounded-full bg-gray-900 text-white hover:bg-gray-800"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add course
          </ButtonLink>
        </div>
      </section>

      <div className="w-fit max-w-full overflow-x-auto rounded-full bg-gray-100 p-1">
        <ListToolbar
          filters={COURSE_STATUS_FILTERS}
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Filter by course status"
          variant="segmented"
        />
      </div>

      {isPending ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading courses"
        >
          {Array.from({ length: COURSES_PAGE_SIZE }, (_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-3xl bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <div className="space-y-3" role="alert">
          <Alert>We couldn&apos;t load the courses. Please try again.</Alert>
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : !data.items.length ? (
        <div className="rounded-3xl bg-gray-50 px-6 py-12 text-center">
          <h2 className="text-sm font-semibold">
            {q || filter !== 'ALL' ? 'No courses match your filters' : 'No courses yet'}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-600">
            {q || filter !== 'ALL'
              ? 'Try another search or status filter.'
              : 'Create your first course, then add modules and lessons to it.'}
          </p>
          {!q && filter === 'ALL' && (
            <ButtonLink
              to={PATHS.admin.courseNew}
              className="mt-4 rounded-full bg-gray-900 text-white hover:bg-gray-800"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add course
            </ButtonLink>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
      {data && data.total > 0 && (
        <Pagination page={data.page} limit={data.limit} total={data.total} onPageChange={setPage} />
      )}
    </div>
  );
}
