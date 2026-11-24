import { PATHS } from '@/lib/paths';
import type { AuthProfile } from '../api/api';

export const SESSION_EXPIRED = 'session-expired';

/** Home page of a signed-in user. */
export function getHomePath(profile: Pick<AuthProfile, 'roleKey'>) {
  if (profile.roleKey === 'teacher') return PATHS.teacher.deliveries;
  if (profile.roleKey === 'admin') return PATHS.admin.dashboard;
  return PATHS.home;
}

/** Where a signed-in user belongs right now. */
export function getPostLoginPath(profile: AuthProfile) {
  return profile.mustChangePassword ? PATHS.changePassword : getHomePath(profile);
}
