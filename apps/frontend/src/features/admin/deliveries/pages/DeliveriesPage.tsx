import { useState } from 'react';
import { AsyncSelect } from '@/components/ui/async-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { ListToolbar } from '@/components/list/ListToolbar';
import { BrandBackdrop } from '@/features/admin/components/BrandBackdrop';
import { CourseSchoolSearch } from '@/features/admin/components/CourseSchoolSearch';
import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { getCourseAccent } from '@/features/admin/courses/config/course-accent';
import { useCourses } from '@/features/admin/courses/queries';
import { useAnySchoolSearch, useSchoolNames } from '@/features/admin/schools/queries';
import { useListParams } from '@/lib/use-list-params';
import {
  DELIVERIES_PAGE_SIZE,
  DELIVERY_STATUS_FILTERS,
  type DeliveryStatusFilter,
} from '../config/deliveries.config';
import { useDeliveries } from '../queries';
import { DeliveryCard } from '../components/DeliveryCard';

export function DeliveriesPage() {
  const {
    filter: status,
    setFilter: setStatus,
    secondary: schoolId,
    setSecondary: setSchoolId,
    page,
    setPage,
  } = useListParams<DeliveryStatusFilter>('ALL');
  const [courseId, setCourseId] = useState('');
  const courses = useCourses({ page: 1, limit: 100, q: '' });
  const { data, isPending, isError, refetch } = useDeliveries({
    page,
    limit: DELIVERIES_PAGE_SIZE,
    schoolId: schoolId || undefined,
    courseId: courseId || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const schoolNames = useSchoolNames();
  const hasFilters = status !== 'ALL' || Boolean(schoolId) || Boolean(courseId);

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <CourseSchoolSearch
          onSelect={({ type, id }) => {
            if (type === 'course') setCourseId(id);
            else setSchoolId(id);
            setPage(1);
          }}
        />
      </HeaderSlot>
      <BrandBackdrop className="rounded-3xl p-6 text-brand-navy lg:p-8">
        <div className="relative max-w-xl">
          <h1 className="text-2xl font-semibold">Deliveries</h1>
          <p className="mt-1 text-xs">
            Run a course for a class, assign teachers, and enroll students.
          </p>
        </div>
      </BrandBackdrop>

      <div
        className="flex max-w-full gap-2 overflow-x-auto pb-1 text-[11px] font-medium"
        role="group"
        aria-label="Filter by course"
      >
        <button
          type="button"
          aria-pressed={!courseId}
          onClick={() => {
            setCourseId('');
            setPage(1);
          }}
          className={`shrink-0 rounded-full px-4 py-2 ${!courseId ? 'bg-brand-navy text-white' : 'bg-brand-chip text-brand-navy'}`}
        >
          All courses
        </button>
        {courses.data?.items.map((course) => {
          const dotColor = getCourseAccent(course.id).split(' ')[0];
          return (
            <button
              key={course.id}
              type="button"
              aria-pressed={courseId === course.id}
              onClick={() => {
                setCourseId(course.id);
                setPage(1);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 ${
                courseId === course.id
                  ? 'bg-brand-navy text-white'
                  : 'bg-brand-chip text-brand-navy'
              }`}
            >
              <span aria-hidden="true" className={`size-2 rounded-full ${dotColor}`} />
              {course.title}
            </button>
          );
        })}
        {courses.isPending && (
          <span role="status" className="px-3 py-2 text-gray-600">
            Loading courses…
          </span>
        )}
      </div>
      {courses.isError && (
        <div role="alert" className="space-y-2">
          <Alert>We couldn&apos;t load the course filters.</Alert>
          <Button variant="secondary" onClick={() => void courses.refetch()}>
            Retry course filters
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:max-w-64">
          <AsyncSelect
            aria-label="Filter by school"
            value={schoolId}
            onChange={setSchoolId}
            useSearch={useAnySchoolSearch}
            placeholder="All schools"
          />
        </div>
        <ListToolbar
          variant="segmented"
          filters={DELIVERY_STATUS_FILTERS}
          filter={status}
          onFilterChange={setStatus}
          filterLabel="Filter by delivery status"
        />
      </div>

      <section className="rounded-2xl bg-gray-50 p-3" aria-label="Delivery results">
        {isPending ? (
          <p role="status" aria-label="Loading deliveries" className="p-8 text-center text-sm">
            Loading deliveries…
          </p>
        ) : isError ? (
          <div role="alert" className="space-y-3 p-3">
            <Alert>We couldn&apos;t load deliveries. Please try again.</Alert>
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : data.items.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((delivery) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                schoolName={
                  schoolNames.get(delivery.schoolId) ?? `School ${delivery.schoolId.slice(0, 8)}`
                }
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white px-6 py-12 text-center">
            <p className="text-sm font-semibold">
              {hasFilters ? 'No deliveries match your filters.' : 'No deliveries yet.'}
            </p>
            {hasFilters && <p className="mt-1 text-xs text-gray-600">Try different filters.</p>}
          </div>
        )}
        {data && data.total > 0 && (
          <div className="px-1 pb-1">
            <Pagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>
    </div>
  );
}
