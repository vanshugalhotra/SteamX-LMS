import { describe, expect, it } from 'vitest';
import { UserType } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { userVisibility } from './user-visibility.js';

describe('userVisibility', () => {
  // Platform staff need no user predicate because school scope is applied separately.
  it('allows platform staff to query all visible users', () => {
    expect(userVisibility(auth(UserType.PLATFORM_STAFF, 'platform-1'))).toEqual({});
  });

  // School staff and students fail closed to their own account.
  it.each([UserType.SCHOOL_STAFF, UserType.STUDENT])(
    'limits %s to the authenticated user',
    (userType) => {
      expect(userVisibility(auth(userType, 'user-1'))).toEqual({ id: 'user-1' });
    },
  );
});

function auth(userType: UserType, userId: string): AuthContext {
  return {
    userId,
    steamxId: 'SCHOOLUSER1',
    name: 'User',
    roleKey: 'role',
    userType,
    schoolId: 'school-1',
    mustChangePassword: false,
  };
}
