import { apiFetch } from '@/lib/api-client';
import { COURSE_MODULE_ENDPOINTS } from './endpoints';
import type {
  CourseModule,
  CreateCourseModulePayload,
  ReorderCourseModulesPayload,
  UpdateCourseModulePayload,
} from '../model/types';
import type { ContentStatus } from '../../courses/model/types';

/** POST /courses/:courseId/modules */
export function createCourseModule(courseId: string, payload: CreateCourseModulePayload) {
  return apiFetch<CourseModule>(COURSE_MODULE_ENDPOINTS.byCourse(courseId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** GET /courses/:courseId/modules */
export function fetchCourseModules(courseId: string) {
  return apiFetch<CourseModule[]>(COURSE_MODULE_ENDPOINTS.byCourse(courseId));
}

/** PUT /courses/:courseId/modules/order */
export function reorderCourseModules(courseId: string, payload: ReorderCourseModulesPayload) {
  return apiFetch<CourseModule[]>(COURSE_MODULE_ENDPOINTS.reorder(courseId), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** GET /modules/:id */
export function fetchCourseModule(id: string) {
  return apiFetch<CourseModule>(COURSE_MODULE_ENDPOINTS.byId(id));
}

/** PATCH /modules/:id */
export function updateCourseModule(id: string, payload: UpdateCourseModulePayload) {
  return apiFetch<CourseModule>(COURSE_MODULE_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /modules/:id/status */
export function updateCourseModuleStatus(id: string, status: ContentStatus) {
  return apiFetch<CourseModule>(COURSE_MODULE_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** DELETE /modules/:id */
export function deleteCourseModule(id: string) {
  return apiFetch<null>(COURSE_MODULE_ENDPOINTS.byId(id), { method: 'DELETE' });
}
