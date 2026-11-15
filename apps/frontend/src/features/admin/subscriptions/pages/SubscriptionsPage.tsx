import { useState } from 'react';
import { BrandBackdrop } from '@/features/admin/components/BrandBackdrop';
import { AsyncSelect } from '@/components/ui/async-select';
import { Pagination } from '@/components/ui/pagination';
import { ListToolbar } from '@/components/list/ListToolbar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCourses } from '@/features/admin/courses/queries';
import { useAnySchoolSearch } from '@/features/admin/schools/queries';
import { useListParams } from '@/lib/use-list-params';
import {
  SUBSCRIPTIONS_PAGE_SIZE,
  SUBSCRIPTION_STATUS_FILTERS,
  getSubscriptionCourseAccent,
} from '../config/subscriptions.config';
import type { SubscriptionStatusFilter } from '../model/types';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { useSubscriptions } from '../queries';

export function SubscriptionsPage() {
  const {
    filter,
    setFilter,
    secondary: schoolId,
    setSecondary: setSchoolId,
    page,
    setPage,
  } = useListParams<SubscriptionStatusFilter>('ALL');
  const [courseId, setCourseId] = useState('');
  const courses = useCourses({ page: 1, limit: 100, q: '' });
  const { data, isPending, isError, refetch } = useSubscriptions({
    page,
    limit: SUBSCRIPTIONS_PAGE_SIZE,
    schoolId: schoolId || undefined,
    courseId: courseId || undefined,
    status: filter === 'ALL' ? undefined : filter,
  });
  const hasFilters = filter !== 'ALL' || Boolean(schoolId) || Boolean(courseId);

  return (
    <div className="space-y-6">
      <BrandBackdrop className="rounded-3xl p-6 text-brand-navy lg:p-8">
        <div className="relative">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold">Subscriptions</h1>
            <p className="mt-1 text-xs">
              Control which schools can use each course, for how long, and how many deliveries they
              can run.
            </p>
          </div>
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
          const dotColor = getSubscriptionCourseAccent(course.id).split(' ')[0];
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
      <div className="flex flex-wrap items-center gap-2">
        <ListToolbar
          variant="segmented"
          filters={SUBSCRIPTION_STATUS_FILTERS}
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Filter by subscription status"
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

      <section className="rounded-2xl bg-gray-50 p-2" aria-label="Subscriptions">
        {isPending ? (
          <div
            role="status"
            aria-label="Loading subscriptions"
            className="grid gap-4 p-2 sm:grid-cols-2 xl:grid-cols-3"
          >
            {Array.from({ length: SUBSCRIPTIONS_PAGE_SIZE }, (_, index) => (
              <div key={index} className="h-72 animate-pulse rounded-3xl bg-white shadow-sm" />
            ))}
          </div>
        ) : isError ? (
          <div className="space-y-3 p-4" role="alert">
            <Alert>We couldn&apos;t load subscriptions. Please try again.</Alert>
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : data.items.length ? (
          <div className="grid gap-4 p-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((subscription) => (
              <SubscriptionCard key={subscription.id} subscription={subscription} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl bg-white px-6 py-12 text-center">
            <p className="text-sm font-semibold">
              {hasFilters ? 'No subscriptions match your filters.' : 'No subscriptions yet.'}
            </p>
            {hasFilters && <p className="mt-1 text-xs text-gray-600">Try a different filter.</p>}
          </div>
        )}
        {data && data.total > 0 && (
          <div className="px-2 pb-2">
            <Pagination
              page={data.page}
              limit={data.limit}
              total={data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>
      {courses.isError && (
        <div role="alert" className="space-y-2">
          <Alert>We couldn&apos;t load the course filters.</Alert>
          <Button variant="secondary" onClick={() => void courses.refetch()}>
            Retry course filters
          </Button>
        </div>
      )}
    </div>
  );
}
