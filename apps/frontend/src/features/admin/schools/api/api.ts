import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import { SCHOOL_ENDPOINTS } from './endpoints';

// Mirrors the backend SchoolResponseDto
export type SchoolStatus = 'ACTIVE' | 'INACTIVE';

export interface School {
  id: string;
  code: string;
  name: string;
  streetAddress: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: SchoolStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolListParams {
  page: number;
  limit: number;
  q: string;
  status: SchoolStatus | 'ALL';
}

export interface SchoolInput {
  name: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  streetAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface CreateSchoolPayload extends SchoolInput {
  code: string;
}

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
