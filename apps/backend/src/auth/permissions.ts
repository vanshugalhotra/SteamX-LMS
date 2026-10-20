export const PERMISSION = {
  USER_PASSWORD_RESET: 'user.password.reset',
  USER_READ: 'user.read',
  USER_CREATE_TEACHER: 'user.create.teacher',
  USER_CREATE_STUDENT: 'user.create.student',
  USER_STEAMX_ID_UPDATE: 'user.steamx-id.update',
  USER_UPDATE: 'user.update',
  USER_DEACTIVATE: 'user.deactivate',
  SCHOOL_READ: 'school.read',
  SCHOOL_MANAGE: 'school.manage',
  CURRICULUM_READ: 'curriculum.read',
  CURRICULUM_WRITE: 'curriculum.write',
  CLASSSECTION_READ: 'classsection.read',
  CLASSSECTION_MANAGE: 'classsection.manage',
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];

export const USER_ROLE_KEY = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export type UserRoleKey = (typeof USER_ROLE_KEY)[keyof typeof USER_ROLE_KEY];
