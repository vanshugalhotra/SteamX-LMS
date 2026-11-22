import { redirect } from 'react-router';
import { queryClient } from '@/lib/query-client';
import { getHomePath, getPostLoginPath } from './model/redirects';
import { sessionQueryOptions } from './queries';
import { PATHS } from '@/lib/paths';
import type { AuthProfile } from './api/api';

export async function guestOnlyLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  return session ? redirect(getPostLoginPath(session)) : null;
}

export async function changePasswordLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(PATHS.login);
  if (!session.mustChangePassword) return redirect(getHomePath(session));
  return session;
}

async function loadProtectedSession(): Promise<AuthProfile | Response> {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(PATHS.login);
  if (session.mustChangePassword) return redirect(PATHS.changePassword);
  return session;
}

export function protectedLoader() {
  return loadProtectedSession();
}

export function roleProtectedLoader(roleKey: 'admin' | 'teacher') {
  return async () => {
    const session = await loadProtectedSession();
    if (session instanceof Response) return session;
    if (session.roleKey !== roleKey) return redirect(getHomePath(session));
    return session;
  };
}
