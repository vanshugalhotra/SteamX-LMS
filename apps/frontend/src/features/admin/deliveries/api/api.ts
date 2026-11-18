import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { DELIVERY_ENDPOINTS } from './endpoints';
import type {
  CreateDeliveryPayload,
  Delivery,
  DeliveryListParams,
  DeliveryStatus,
  UpdateDeliveryLabelPayload,
} from '../model/types';

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
  return apiFetch<Paginated<Delivery>>(`${DELIVERY_ENDPOINTS.list}?${search.toString()}`);
}

/** GET /deliveries/:id */
export function fetchDelivery(id: string) {
  return apiFetch<Delivery>(DELIVERY_ENDPOINTS.byId(id));
}

/** POST /deliveries */
export function createDelivery(payload: CreateDeliveryPayload) {
  return apiFetch<Delivery>(DELIVERY_ENDPOINTS.list, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /deliveries/:id */
export function updateDeliveryLabel(id: string, payload: UpdateDeliveryLabelPayload) {
  return apiFetch<Delivery>(DELIVERY_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /deliveries/:id/status */
export function updateDeliveryStatus(id: string, status: DeliveryStatus) {
  return apiFetch<Delivery>(DELIVERY_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
