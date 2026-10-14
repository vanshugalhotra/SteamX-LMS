import type { AuthProfile } from './api';

export const AUTH_PATHS = {
  login: '/login',
  changePassword: '/change-password',
  afterLogin: '/',
} as const;

/** Where a signed-in user belongs right now. */
export function getPostLoginPath(profile: AuthProfile) {
  return profile.mustChangePassword ? AUTH_PATHS.changePassword : AUTH_PATHS.afterLogin;
}
