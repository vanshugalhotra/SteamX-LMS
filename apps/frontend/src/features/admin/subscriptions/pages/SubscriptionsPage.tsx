import { useState } from 'react';
import { AsyncSelect } from '@/components/ui/async-select';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useAnySchoolSearch } from '@/features/admin/schools/queries';
import { useListParams } from '@/lib/use-list-params';
import {
  SUBSCRIPTIONS_PAGE_SIZE,
  SUBSCRIPTION_STATUS_FILTERS,
  subscriptionColumns,
} from '../config/subscriptions.config';
import type { SubscriptionStatusFilter } from '../model/types';
import { useSubscriptionCourseSearch, useSubscriptions } from '../queries';

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
      <div>
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="mt-1 text-xs text-gray-600">
          Manage school access terms and the delivery limits for each course.
        </p>
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
        <div className="w-full sm:max-w-64">
          <AsyncSelect
            aria-label="Filter by course"
            value={courseId}
            onChange={(value) => {
              setCourseId(value);
              setPage(1);
            }}
            useSearch={useSubscriptionCourseSearch}
            placeholder="All courses"
          />
        </div>
      </div>

      <section className="rounded-2xl bg-gray-50 p-2" aria-label="Subscriptions">
        <DataTable
          columns={subscriptionColumns}
          rows={data?.items}
          getRowId={(subscription) => subscription.id}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          emptyMessage={
            hasFilters ? 'No subscriptions match your filters.' : 'No subscriptions yet.'
          }
          errorMessage="We couldn't load subscriptions. Please try again."
          loadingLabel="Loading subscriptions"
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
