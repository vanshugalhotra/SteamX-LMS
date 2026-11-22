import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { DELIVERY_ENDPOINTS } from './endpoints';
import type {
  CreateDeliveryPayload,
  Delivery,
  DeliveryEnrollmentListParams,
  DeliveryEnrollment,
  DeliveryListParams,
  DeliveryStatus,
  DeliveryTeacher,
  DeliveryTeacherListParams,
  EnrollDeliveryStudentsPayload,
  EnrollmentCounts,
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

/** GET /deliveries/:id/teachers */
export function fetchDeliveryTeachers({
  deliveryId,
  page,
  limit,
}: DeliveryTeacherListParams) {
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
export function enrollDeliveryStudents(
  deliveryId: string,
  payload: EnrollDeliveryStudentsPayload,
) {
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
