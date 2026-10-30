import { apiFetch } from '@/lib/api-client';
import { LESSON_ENDPOINTS } from './endpoints';
import type {
  CreateLessonPayload,
  Lesson,
  LessonContent,
  LessonListParams,
  ReorderLessonsPayload,
  SaveLessonContentPayload,
  UpdateLessonPayload,
} from '../model/types';
import type { ContentStatus } from '../../../courses/model/types';

/** POST /modules/:moduleId/lessons */
export function createLesson(moduleId: string, payload: CreateLessonPayload) {
  return apiFetch<Lesson>(LESSON_ENDPOINTS.byModule(moduleId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** GET /modules/:moduleId/lessons */
export function fetchLessons(params: LessonListParams) {
  return apiFetch<Lesson[]>(LESSON_ENDPOINTS.byModule(params.moduleId));
}

/** PUT /modules/:moduleId/lessons/order */
export function reorderLessons(moduleId: string, payload: ReorderLessonsPayload) {
  return apiFetch<Lesson[]>(LESSON_ENDPOINTS.reorder(moduleId), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** GET /lessons/:id */
export function fetchLesson(id: string) {
  return apiFetch<Lesson>(LESSON_ENDPOINTS.byId(id));
}

/** PATCH /lessons/:id */
export function updateLesson(id: string, payload: UpdateLessonPayload) {
  return apiFetch<Lesson>(LESSON_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /lessons/:id/status */
export function updateLessonStatus(id: string, status: ContentStatus) {
  return apiFetch<Lesson>(LESSON_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** DELETE /lessons/:id */
export function deleteLesson(id: string) {
  return apiFetch<null>(LESSON_ENDPOINTS.byId(id), { method: 'DELETE' });
}

/** GET /lessons/:id/content */
export function fetchLessonContent(id: string) {
  return apiFetch<LessonContent>(LESSON_ENDPOINTS.content(id));
}

/** PUT /lessons/:id/content */
export function saveLessonContent(id: string, payload: SaveLessonContentPayload) {
  return apiFetch<LessonContent>(LESSON_ENDPOINTS.content(id), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
