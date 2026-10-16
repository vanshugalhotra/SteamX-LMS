import type { AuthProfile } from '../api/api';
import { ADMIN_PATHS } from '@/features/admin/paths';

export const AUTH_PATHS = {
  login: '/login',
  changePassword: '/change-password',
} as const;

export const SESSION_EXPIRED = 'session-expired';

/** Home page of a signed-in user. */
// TODO: pick by role once teacher/student layouts exist (add a `profile` argument then).
export function getHomePath() {
  return ADMIN_PATHS.dashboard;
}

/** Where a signed-in user belongs right now. */
export function getPostLoginPath(profile: AuthProfile) {
  return profile.mustChangePassword ? AUTH_PATHS.changePassword : getHomePath();
}
