import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { DELIVERY_ENDPOINTS } from './endpoints';
export { buildDeliveryListSearchParams, fetchDeliveries } from '@/features/deliveries/api/api';
import type {
  CreateDeliveryPayload,
  Delivery,
  DeliveryEnrollmentListParams,
  DeliveryEnrollment,
  DeliveryStatus,
  DeliveryTeacher,
  DeliveryTeacherListParams,
  EnrollDeliveryStudentsPayload,
  EnrollmentCounts,
  LessonReleaseResponse,
  ModuleReleaseResponse,
  ReleaseOutlineResponse,
  UpdateDeliveryLabelPayload,
} from '../model/types';

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

/** GET /deliveries/:id/teachers */
export function fetchDeliveryTeachers({ deliveryId, page, limit }: DeliveryTeacherListParams) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiFetch<Paginated<DeliveryTeacher>>(
    `${DELIVERY_ENDPOINTS.teachers(deliveryId)}?${search.toString()}`,
  );
}

/** POST /deliveries/:id/teachers */
export function assignDeliveryTeacher(deliveryId: string, teacherId: string) {
  return apiFetch<DeliveryTeacher>(DELIVERY_ENDPOINTS.teachers(deliveryId), {
    method: 'POST',
    body: JSON.stringify({ teacherId }),
  });
}

/** DELETE /deliveries/:id/teachers/:teacherId */
export async function removeDeliveryTeacher(deliveryId: string, teacherId: string): Promise<void> {
  await apiFetch<undefined>(DELIVERY_ENDPOINTS.teacher(deliveryId, teacherId), {
    method: 'DELETE',
  });
}

/** GET /deliveries/:id/enrollments */
export function fetchDeliveryEnrollments({
  deliveryId,
  page,
  limit,
  status,
}: DeliveryEnrollmentListParams) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) search.set('status', status);
  return apiFetch<Paginated<DeliveryEnrollment>>(
    `${DELIVERY_ENDPOINTS.enrollments(deliveryId)}?${search.toString()}`,
  );
}

/** POST /deliveries/:id/enrollments */
export function enrollDeliveryStudents(deliveryId: string, payload: EnrollDeliveryStudentsPayload) {
  return apiFetch<EnrollmentCounts>(DELIVERY_ENDPOINTS.enrollments(deliveryId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /deliveries/:id/enrollments/:studentId */
export async function removeDeliveryStudent(deliveryId: string, studentId: string): Promise<void> {
  await apiFetch<undefined>(DELIVERY_ENDPOINTS.enrollment(deliveryId, studentId), {
    method: 'DELETE',
  });
}

/** GET /deliveries/:id/releases */
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
