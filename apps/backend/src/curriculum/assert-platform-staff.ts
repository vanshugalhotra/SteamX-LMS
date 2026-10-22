import { ForbiddenException } from '@nestjs/common';
import { UserType } from '../generated/prisma/client.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import type { AuthContext } from '../auth/types/auth-context.js';

/** Rejects any caller that is not platform staff. */
export function assertPlatformStaff(actor: AuthContext): void {
  if (actor.userType !== UserType.PLATFORM_STAFF) {
    throw new ForbiddenException(API_ERROR.FORBIDDEN);
  }
}
