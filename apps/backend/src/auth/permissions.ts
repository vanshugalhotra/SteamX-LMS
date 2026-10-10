export const PERMISSION = {
  USER_PASSWORD_RESET: 'user.password.reset',
} as const;

export type PermissionKey = (typeof PERMISSION)[keyof typeof PERMISSION];
