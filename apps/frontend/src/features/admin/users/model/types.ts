// TODO: these mirror the backend DTOs by hand
export type UserRoleKey = 'admin' | 'teacher' | 'student';
export type UserType = 'PLATFORM_STAFF' | 'SCHOOL_STAFF' | 'STUDENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type UserStatusFilter = UserStatus | 'ALL';

export interface UserProfile {
  guardianName?: string | null;
  classSectionId?: string;
  primaryAssignment?: string | null;
}

/** GET /users/:id and create/update responses. */
export interface User {
  id: string;
  steamxId: string;
  name: string;
  email: string | null;
  status: UserStatus;
  role: { key: string; name: string };
  userType: UserType;
  schoolId: string | null;
  createdAt: string;
  mustChangePassword: boolean;
  profile: UserProfile | null;
}

export type UserListItem = Omit<User, 'mustChangePassword' | 'profile'>;

export interface UserListParams {
  page: number;
  limit: number;
  q: string;
  role: UserRoleKey;
  status: UserStatusFilter;
  /** Platform staff can filter by school; school users are scoped by the backend. */
  schoolId?: string;
}

export interface CreateTeacherPayload {
  name: string;
  password: string;
  email?: string | null;
  primaryAssignment?: string | null;
  /** Required for platform staff (they have no school of their own). */
  schoolId?: string;
}

export interface CreateStudentPayload {
  name: string;
  password: string;
  classSectionId: string;
  guardianName?: string | null;
  schoolId?: string;
}

/** PATCH /users/:id. Send only fields that apply to the user's type. */
export interface UpdateUserPayload {
  name?: string;
  email?: string | null;
  primaryAssignment?: string | null; // teachers only
  guardianName?: string | null; // students only
  classSectionId?: string; // students only
}
