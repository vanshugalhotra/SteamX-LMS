import { NotFoundException } from '@nestjs/common';
import { UserType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { resolveSchoolScope, schoolFilter } from './school-scope.js';

const PLATFORM_AUTH: AuthContext = {
  userId: 'admin-id',
  steamxId: 'ADM123',
  name: 'Platform Admin',
  roleKey: 'admin',
  userType: UserType.PLATFORM_STAFF,
  schoolId: null,
  mustChangePassword: false,
};

const SCHOOL_AUTH: AuthContext = {
  ...PLATFORM_AUTH,
  userId: 'teacher-id',
  steamxId: 'TCH123',
  name: 'Teacher',
  roleKey: 'teacher',
  userType: UserType.SCHOOL_STAFF,
  schoolId: 'school-a',
};

describe('school scope', () => {
  it('allows platform staff to request all schools or a specific school', () => {
    expect(resolveSchoolScope(PLATFORM_AUTH)).toBeUndefined();
    expect(resolveSchoolScope(PLATFORM_AUTH, 'school-b')).toBe('school-b');
  });

  it('always scopes school staff to their own school', () => {
    expect(resolveSchoolScope(SCHOOL_AUTH)).toBe('school-a');
    expect(resolveSchoolScope(SCHOOL_AUTH, 'school-a')).toBe('school-a');
  });

  it('hides a foreign school behind the standard not-found exception', () => {
    try {
      resolveSchoolScope(SCHOOL_AUTH, 'school-b');
      throw new Error('Expected resolveSchoolScope to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getStatus()).toBe(404);
      expect((error as NotFoundException).getResponse()).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }
  });

  it('fails closed for school staff without a school assignment', () => {
    expect(() => resolveSchoolScope({ ...SCHOOL_AUTH, schoolId: null })).toThrow(NotFoundException);
  });

  it('creates a school filter only when scope is present', () => {
    expect(schoolFilter('school-a')).toEqual({ schoolId: 'school-a' });
    expect(schoolFilter(undefined)).toEqual({});
  });
});
