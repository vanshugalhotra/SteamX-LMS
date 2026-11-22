import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '@/lib/paths';
import type { AuthProfile } from './api/api';
import { getHomePath } from './model/redirects';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/query-client', () => ({ queryClient: { query } }));

import {
  changePasswordLoader,
  guestOnlyLoader,
  protectedLoader,
  roleProtectedLoader,
} from './loaders';

const profile = (mustChangePassword: boolean, roleKey = 'admin') =>
  ({ mustChangePassword, roleKey }) as AuthProfile;
const redirectTarget = (result: unknown) => (result as Response).headers.get('Location');

describe('auth route guards', () => {
  beforeEach(() => {
    query.mockReset();
  });

  describe('protectedLoader', () => {
    it('redirects guests to login', async () => {
      query.mockResolvedValue(null);
      expect(redirectTarget(await protectedLoader())).toBe(PATHS.login);
    });

    it('sends users who must change their password to the change-password page', async () => {
      query.mockResolvedValue(profile(true));
      expect(redirectTarget(await protectedLoader())).toBe(PATHS.changePassword);
    });

    it('lets a normal session through and returns it', async () => {
      const session = profile(false);
      query.mockResolvedValue(session);
      expect(await protectedLoader()).toBe(session);
    });
  });

  describe('changePasswordLoader', () => {
    it('redirects guests to login', async () => {
      query.mockResolvedValue(null);
      expect(redirectTarget(await changePasswordLoader())).toBe(PATHS.login);
    });

    it('redirects users who do not need to change password to home', async () => {
      query.mockResolvedValue(profile(false));
      expect(redirectTarget(await changePasswordLoader())).toBe(getHomePath(profile(false)));
    });

    it('lets users who must change their password through', async () => {
      const session = profile(true);
      query.mockResolvedValue(session);
      expect(await changePasswordLoader()).toBe(session);
    });
  });

  describe('guestOnlyLoader', () => {
    it('lets guests see the login page', async () => {
      query.mockResolvedValue(null);
      expect(await guestOnlyLoader()).toBeNull();
    });

    it('sends a signed-in user home', async () => {
      query.mockResolvedValue(profile(false));
      expect(redirectTarget(await guestOnlyLoader())).toBe(getHomePath(profile(false)));
    });

    it('sends a signed-in user who must change password to change-password', async () => {
      query.mockResolvedValue(profile(true));
      expect(redirectTarget(await guestOnlyLoader())).toBe(PATHS.changePassword);
    });
  });

  describe('roleProtectedLoader', () => {
    it('sends teachers away from admin routes to their deliveries', async () => {
      query.mockResolvedValue(profile(false, 'teacher'));
      expect(redirectTarget(await roleProtectedLoader('admin')())).toBe(
        PATHS.teacher.deliveries,
      );
    });

    it('sends admins away from teacher routes to the admin dashboard', async () => {
      query.mockResolvedValue(profile(false, 'admin'));
      expect(redirectTarget(await roleProtectedLoader('teacher')())).toBe(
        PATHS.admin.dashboard,
      );
    });

    it('allows a user with the required role through', async () => {
      const session = profile(false, 'teacher');
      query.mockResolvedValue(session);
      expect(await roleProtectedLoader('teacher')()).toBe(session);
    });
  });
});
