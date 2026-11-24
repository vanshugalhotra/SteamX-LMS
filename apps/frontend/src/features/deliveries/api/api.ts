import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import type { Delivery, DeliveryListParams } from '../model/types';

export function buildDeliveryListSearchParams(params: DeliveryListParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.schoolId) search.set('schoolId', params.schoolId);
  if (params.courseId) search.set('courseId', params.courseId);
  if (params.academicYear) search.set('academicYear', params.academicYear);
  if (params.status) search.set('status', params.status);
  return search;
}

/** GET /deliveries */
export function fetchDeliveries(params: DeliveryListParams) {
  const search = buildDeliveryListSearchParams(params);
  return apiFetch<Paginated<Delivery>>(`/deliveries?${search.toString()}`);
}
