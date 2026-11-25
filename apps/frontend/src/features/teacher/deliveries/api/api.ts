import { fetchDeliveries } from '@/features/deliveries/api/api';
import type { DeliveryStatus } from '@/features/deliveries/model/types';
import type { TeacherDeliveryListParams } from '../model/types';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_PAGE_CONCURRENCY = 5;

/** GET /deliveries; the server scopes results to this teacher's school and assignments. */
export function fetchTeacherDeliveries(params: TeacherDeliveryListParams) {
  return fetchDeliveries(params);
}

/** Loads every server-scoped page only when the page needs client-side text search. */
export async function fetchAllTeacherDeliveries(status?: DeliveryStatus) {
  const filters = status ? { status } : {};
  const firstPage = await fetchTeacherDeliveries({
    page: 1,
    limit: SEARCH_PAGE_SIZE,
    ...filters,
  });
  const pageCount = Math.ceil(firstPage.total / firstPage.limit);
  const items = [...firstPage.items];

  for (
    let firstPageNumber = 2;
    firstPageNumber <= pageCount;
    firstPageNumber += SEARCH_PAGE_CONCURRENCY
  ) {
    const pageNumbers = Array.from(
      { length: Math.min(SEARCH_PAGE_CONCURRENCY, pageCount - firstPageNumber + 1) },
      (_, index) => firstPageNumber + index,
    );
    const pages = await Promise.all(
      pageNumbers.map((page) =>
        fetchTeacherDeliveries({ page, limit: firstPage.limit, ...filters }),
      ),
    );
    items.push(...pages.flatMap((page) => page.items));
  }

  return items;
}
