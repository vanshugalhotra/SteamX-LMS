/**
 * Keeps school staff in their own school and hides foreign IDs as not found.
 */
import { NotFoundException } from '@nestjs/common';
import { UserType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../errors/api-errors.js';

export function resolveSchoolScope(
  auth: AuthContext,
  requestedSchoolId?: string,
): string | undefined {
  if (auth.userType === UserType.PLATFORM_STAFF) {
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

export function schoolFilter(scope: string | undefined): { schoolId: string } | {} {
  return scope === undefined ? {} : { schoolId: scope };
}
