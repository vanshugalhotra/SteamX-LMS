import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import type { ClassSection } from '../model/types';
import type { CreateClassSectionPayload, UpdateClassSectionPayload } from '../model/types';

/** GET /class-sections */
export function fetchClassSections(params: {
  page: number;
  limit: number;
  q: string;
  schoolId?: string;
}) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.q) search.set('q', params.q);
  if (params.schoolId) search.set('schoolId', params.schoolId);
  return apiFetch<Paginated<ClassSection>>(`/class-sections?${search.toString()}`);
}

/** GET /class-sections/:id */
export function fetchClassSection(id: string) {
  return apiFetch<ClassSection>(`/class-sections/${id}`);
}

/** POST /class-sections */
export function createClassSection(payload: CreateClassSectionPayload) {
  return apiFetch<ClassSection>('/class-sections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /class-sections/:id (the school cannot be changed). */
export function updateClassSection(id: string, payload: UpdateClassSectionPayload) {
  return apiFetch<ClassSection>(`/class-sections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** DELETE /class-sections/:id */
export function deleteClassSection(id: string) {
  return apiFetch<null>(`/class-sections/${id}`, { method: 'DELETE' });
}
