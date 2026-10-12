import type { AuthProfile } from './api';

export const AUTH_PATHS = {
  login: '/login',
  // TODO: /change-password page doesn't exist yet. Add the route + page
  // (mustChangePassword users are redirected here by getPostLoginPath).
  changePassword: '/change-password',
  afterLogin: '/',
} as const;

/** Where a signed-in user belongs right now. */
export function getPostLoginPath(profile: AuthProfile) {
  return profile.mustChangePassword ? AUTH_PATHS.changePassword : AUTH_PATHS.afterLogin;
}
