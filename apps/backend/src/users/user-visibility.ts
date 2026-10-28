/** Defines user-record visibility separately from school tenant scope. */
import { UserType, type Prisma } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';

/**
 * Resolves which user records a caller may see, independently of school scope.
 * Platform staff see all users; school staff and students currently see only themselves.
 * The query filter hides foreign user IDs as 404 rather than revealing their existence.
 * Returns the Prisma user predicate to combine with the caller's school filter.
 */
export function userVisibility(auth: AuthContext): Prisma.UserWhereInput {
  if (auth.userType === UserType.PLATFORM_STAFF) {
    return {};
  }

  return { id: auth.userId };
}
