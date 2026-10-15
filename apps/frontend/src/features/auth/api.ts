import { ApiError, apiFetch } from '@/lib/api-client';
import { AUTH_ENDPOINTS } from './endpoints';

// Mirrors the backend AuthProfile (Swagger: Authentication).
export interface AuthProfile {
  id: string;
  steamxId: string;
  name: string;
  roleKey: string;
  userType: string;
  schoolId: string | null;
  mustChangePassword: boolean;
}

export interface LoginPayload {
  steamxId: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/** POST /auth/login: sets the httpOnly session cookie and returns the profile. */
export function login(payload: LoginPayload) {
  return apiFetch<AuthProfile>(AUTH_ENDPOINTS.login, {
    method: 'POST',
    body: JSON.stringify(payload),
    skipAuthHandlers: true, // wrong credentials are a normal 401, not an expired session
  });
}

/** GET /auth/me: the current profile, or null when nobody is signed in. */
export async function fetchSession(): Promise<AuthProfile | null> {
  try {
    return await apiFetch<AuthProfile>(AUTH_ENDPOINTS.me, { skipAuthHandlers: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** POST /auth/change-password: sets a fresh session cookie and returns the updated profile. */
export function changePassword(payload: ChangePasswordPayload) {
  return apiFetch<AuthProfile>(AUTH_ENDPOINTS.changePassword, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** POST /auth/logout: the server clears the session cookie. */
export function logout() {
  return apiFetch<null>(AUTH_ENDPOINTS.logout, {
    method: 'POST',
    skipAuthHandlers: true,
  });
}
