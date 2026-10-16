/**
 * Limits user reads to the records visible to the authenticated caller.
 */
import { UserType, type Prisma } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';

export function userVisibility(auth: AuthContext): Prisma.UserWhereInput {
  if (auth.userType === UserType.PLATFORM_STAFF) {
    return {};
  }

  // TODO(teacher-user-mgmt): teachers see only users in their own deliveries once deliveries exist
  return { id: auth.userId };
}
