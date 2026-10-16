import { PATHS } from '@/lib/paths';
import type { AuthProfile } from '../api/api';

export const SESSION_EXPIRED = 'session-expired';

/** Home page of a signed-in user. */
// TODO: pick by role once teacher/student layouts exist (add a `profile` argument then).
export function getHomePath() {
  return PATHS.admin.dashboard;
}

/** Where a signed-in user belongs right now. */
export function getPostLoginPath(profile: AuthProfile) {
  return profile.mustChangePassword ? PATHS.changePassword : getHomePath();
}
