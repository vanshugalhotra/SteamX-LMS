import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { SCHOOL_ENDPOINTS } from './endpoints';
import type {
  CreateSchoolPayload,
  School,
  SchoolInput,
  SchoolListParams,
  SchoolStatus,
} from '../model/types';

/** GET /schools */
export function fetchSchools({ page, limit, q, status }: SchoolListParams) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  if (status !== 'ALL') search.set('status', status);
  return apiFetch<Paginated<School>>(`${SCHOOL_ENDPOINTS.list}?${search.toString()}`);
}

/** POST /schools */
export function createSchool(payload: CreateSchoolPayload) {
  return apiFetch<School>(SCHOOL_ENDPOINTS.list, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /schools/:id */
export function updateSchool(id: string, payload: SchoolInput) {
  return apiFetch<School>(SCHOOL_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /schools/:id/status (not part of the normal update). */
export function updateSchoolStatus(id: string, status: SchoolStatus) {
  return apiFetch<School>(SCHOOL_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
