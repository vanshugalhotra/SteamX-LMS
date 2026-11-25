import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { Pagination } from '@/components/ui/pagination';
import { BrandBackdrop } from '@/features/admin/components/BrandBackdrop';
import {
  DELIVERIES_PAGE_SIZE,
  DELIVERY_STATUS_FILTERS,
  type DeliveryStatusFilter,
} from '@/features/deliveries/config/deliveries.config';
import { useListParams } from '@/lib/use-list-params';
import { TeacherDeliveryCard } from '../deliveries/components/TeacherDeliveryCard';
import { useTeacherDeliveries, useTeacherDeliverySearch } from '../deliveries/queries';

export function TeacherDeliveriesPage() {
  const { search, setSearch, q, filter, setFilter, page, setPage } =
    useListParams<DeliveryStatusFilter>('ALL');
  const status = filter === 'ALL' ? undefined : filter;
  const deliveries = useTeacherDeliveries(
    {
      page,
      limit: DELIVERIES_PAGE_SIZE,
      ...(status ? { status } : {}),
    },
    !q,
  );
  const searchDeliveries = useTeacherDeliverySearch(status, Boolean(q));
  const normalizedSearch = q.toLowerCase();
  const searchResults = q
    ? searchDeliveries.data?.filter((delivery) => {
        return [
          delivery.course.title,
          delivery.label,
          delivery.academicYear,
          delivery.displayName,
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      })
    : undefined;
  const visibleDeliveries = q
    ? searchResults?.slice((page - 1) * DELIVERIES_PAGE_SIZE, page * DELIVERIES_PAGE_SIZE)
    : deliveries.data?.items;
  const resultCount = q ? searchResults?.length : deliveries.data?.total;
  const isPending = q ? searchDeliveries.isPending : deliveries.isPending;
  const isError = q ? searchDeliveries.isError : deliveries.isError;
  const refetch = q ? searchDeliveries.refetch : deliveries.refetch;
  const deliveryCount =
    isPending || isError || (!q && deliveries.isPlaceholderData) ? '—' : String(resultCount ?? 0);
  const deliveryCountLabel = q
    ? 'Matching deliveries'
    : filter === 'ALL'
      ? 'Assigned deliveries'
      : filter === 'ACTIVE'
        ? 'Active deliveries'
        : 'Inactive deliveries';

  return (
    <section className="space-y-6" aria-labelledby="teacher-deliveries-title">
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search my deliveries"
        label="Search my deliveries"
      />

      <BrandBackdrop className="rounded-3xl p-6 text-brand-navy lg:p-8">
        <div className="relative max-w-2xl">
          <h2 id="teacher-deliveries-title" className="text-2xl font-semibold">
            My deliveries
          </h2>
          <p className="mt-1 text-sm">
            The classes you teach. View the deliveries assigned to you.
          </p>
          <div className="mt-6">
            <p className="text-2xl font-semibold">{deliveryCount}</p>
            <p className="mt-1 text-xs">{deliveryCountLabel}</p>
          </div>
        </div>
      </BrandBackdrop>

      <div className="flex flex-wrap items-center gap-2">
        <ListToolbar
          variant="segmented"
          filters={DELIVERY_STATUS_FILTERS}
          filter={filter}
          onFilterChange={setFilter}
          filterLabel="Filter by delivery status"
        />
      </div>

      <section className="space-y-4" aria-label="Delivery results">
        {isPending ? (
          <p role="status" aria-label="Loading deliveries" className="p-8 text-center text-sm">
            Loading deliveries…
          </p>
        ) : isError ? (
          <div role="alert" className="space-y-3 p-3">
            <Alert>We couldn&apos;t load your deliveries. Please try again.</Alert>
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : visibleDeliveries?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleDeliveries.map((delivery) => (
              <TeacherDeliveryCard key={delivery.id} delivery={delivery} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-gray-50 px-6 py-12 text-center">
            <p className="text-sm font-semibold">
              {q
                ? 'No deliveries match your search.'
                : filter === 'ALL'
                  ? 'No deliveries assigned yet.'
                  : `No ${filter.toLowerCase()} deliveries found.`}
            </p>
          </div>
        )}
        {!isError && resultCount !== undefined && resultCount > 0 && (
          <div className="px-1 pb-1">
            <Pagination
              page={q ? page : (deliveries.data?.page ?? page)}
              limit={q ? DELIVERIES_PAGE_SIZE : (deliveries.data?.limit ?? DELIVERIES_PAGE_SIZE)}
              total={resultCount}
              onPageChange={setPage}
            />
          </div>
        )}
      </section>
    </section>
  );
}
