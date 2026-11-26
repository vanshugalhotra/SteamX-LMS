import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { DELIVERY_ENDPOINTS } from './endpoints';
import type {
  Delivery,
  DeliveryListParams,
  LessonReleaseResponse,
  ModuleReleaseResponse,
  ReleaseOutlineResponse,
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

/** GET /deliveries/:id; server-side school and teacher assignment scope is enforced. */
export function fetchDelivery(id: string) {
  return apiFetch<Delivery>(DELIVERY_ENDPOINTS.byId(id));
}

/** GET /deliveries/:id/releases; server-side delivery visibility is enforced. */
export function fetchDeliveryReleaseOutline(deliveryId: string) {
  return apiFetch<ReleaseOutlineResponse>(DELIVERY_ENDPOINTS.releases(deliveryId));
}

/** PUT /deliveries/:id/releases/lessons/:lessonId */
export function releaseDeliveryLesson(deliveryId: string, lessonId: string) {
  return apiFetch<LessonReleaseResponse>(DELIVERY_ENDPOINTS.releaseLesson(deliveryId, lessonId), {
    method: 'PUT',
  });
}

/** DELETE /deliveries/:id/releases/lessons/:lessonId */
export async function unreleaseDeliveryLesson(deliveryId: string, lessonId: string): Promise<void> {
  await apiFetch<undefined>(DELIVERY_ENDPOINTS.releaseLesson(deliveryId, lessonId), {
    method: 'DELETE',
  });
}

/** POST /deliveries/:id/releases/modules/:moduleId */
export function releaseDeliveryModule(deliveryId: string, moduleId: string) {
  return apiFetch<ModuleReleaseResponse>(DELIVERY_ENDPOINTS.releaseModule(deliveryId, moduleId), {
    method: 'POST',
  });
}
