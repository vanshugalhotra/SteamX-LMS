/** Shared rules for deciding which school-owned records a caller may access. */
import { NotFoundException } from '@nestjs/common';
import { UserType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../errors/api-errors.js';

/**
 * Resolves which school's data a caller may access.
 * Platform staff may request any school; school users are fixed to their own school.
 * A mismatch returns 404 so callers cannot discover whether a foreign school exists.
 * Returns the selected school ID, or undefined for platform-wide scope.
 */
export function resolveSchoolScope(
  auth: AuthContext,
  requestedSchoolId?: string,
): string | undefined {
  if (auth.userType === UserType.PLATFORM_STAFF) {
    // No requested ID means platform staff can query across schools.
    return requestedSchoolId;
  }

  if (
    auth.schoolId === null ||
    (requestedSchoolId !== undefined && requestedSchoolId !== auth.schoolId)
  ) {
    throw new NotFoundException(API_ERROR.NOT_FOUND);
  }

  return auth.schoolId;
}

/**
 * Turns a resolved scope into a Prisma where fragment.
 * For example, spreading scope "school-a" into a class-section where gives
 * { schoolId: "school-a", ... }, so Prisma filters rows in the database; undefined gives {},
 * allowing platform-wide results. Use the same scoped where for counts when needed.
 * Call resolveSchoolScope first: school staff must never pass an arbitrary or missing scope here.
 */
export function schoolFilter(scope: string | undefined): { schoolId: string } | {} {
  return scope === undefined ? {} : { schoolId: scope };
}
