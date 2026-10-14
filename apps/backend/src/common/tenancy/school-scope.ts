/**
 * Keeps school staff in their own school and hides foreign IDs as not found.
 */
import { NotFoundException } from '@nestjs/common';
import { UserType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';

const RESOURCE_NOT_FOUND = {
  code: 'NOT_FOUND',
  message: 'Resource not found',
};

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
    throw new NotFoundException(RESOURCE_NOT_FOUND);
  }

  return auth.schoolId;
}

export function schoolFilter(scope: string | undefined): { schoolId: string } | {} {
  return scope === undefined ? {} : { schoolId: scope };
}
