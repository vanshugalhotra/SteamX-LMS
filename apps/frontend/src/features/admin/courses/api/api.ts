import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { COURSE_ENDPOINTS } from './endpoints';
import type {
  Course,
  CourseListParams,
  CourseOutline,
  CreateCoursePayload,
  UpdateCoursePayload,
} from '../model/types';
import type { ContentStatus } from '@/lib/content-status';

export function buildCourseListSearchParams(params: CourseListParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  return search;
}

/** GET /courses */
export function fetchCourses(params: CourseListParams) {
  const search = buildCourseListSearchParams(params);
  return apiFetch<Paginated<Course>>(`${COURSE_ENDPOINTS.list}?${search.toString()}`);
}

/** GET /courses/:id */
export function fetchCourse(id: string) {
  return apiFetch<Course>(COURSE_ENDPOINTS.byId(id));
}

/** GET /courses/:id/outline */
export function fetchCourseOutline(id: string) {
  return apiFetch<CourseOutline>(COURSE_ENDPOINTS.outline(id));
}

/** POST /courses */
export function createCourse(payload: CreateCoursePayload) {
  return apiFetch<Course>(COURSE_ENDPOINTS.list, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /courses/:id */
export function updateCourse(id: string, payload: UpdateCoursePayload) {
  return apiFetch<Course>(COURSE_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /courses/:id/status */
export function updateCourseStatus(id: string, status: ContentStatus) {
  return apiFetch<Course>(COURSE_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** DELETE /courses/:id */
export function deleteCourse(id: string) {
  return apiFetch<null>(COURSE_ENDPOINTS.byId(id), { method: 'DELETE' });
}
