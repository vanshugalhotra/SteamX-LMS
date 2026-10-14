export const PERMISSION = {
  USER_PASSWORD_RESET: 'user.password.reset',
  SCHOOL_READ: 'school.read',
  SCHOOL_MANAGE: 'school.manage',
  CLASSSECTION_READ: 'classsection.read',
  CLASSSECTION_MANAGE: 'classsection.manage',
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];
