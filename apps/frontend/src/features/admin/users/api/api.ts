import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import type {
  CreateStudentPayload,
  CreateTeacherPayload,
  UpdateUserPayload,
  User,
  UserListItem,
  UserListParams,
  UserStatus,
} from '../model/types';
import { USER_ENDPOINTS } from './endpoints';

/** GET /users */
export function fetchUsers({ page, limit, q, role, status, schoolId }: UserListParams) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit), role });
  if (q) search.set('q', q);
  if (status !== 'ALL') search.set('status', status);
  if (schoolId) search.set('schoolId', schoolId);
  return apiFetch<Paginated<UserListItem>>(`${USER_ENDPOINTS.list}?${search.toString()}`);
}

/** GET /users/:id */
export function fetchUser(id: string) {
  return apiFetch<User>(USER_ENDPOINTS.byId(id));
}

/** POST /users/teachers */
export function createTeacher(payload: CreateTeacherPayload) {
  return apiFetch<User>(USER_ENDPOINTS.teachers, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** POST /users/students */
export function createStudent(payload: CreateStudentPayload) {
  return apiFetch<User>(USER_ENDPOINTS.students, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /users/:id */
export function updateUser(id: string, payload: UpdateUserPayload) {
  return apiFetch<User>(USER_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** PATCH /users/:id/status (not part of the normal update). */
export function updateUserStatus(id: string, status: UserStatus) {
  return apiFetch<User>(USER_ENDPOINTS.status(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
