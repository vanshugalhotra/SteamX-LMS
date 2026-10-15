import { redirect } from 'react-router';
import { queryClient } from '@/lib/query-client';
import { AUTH_PATHS, getPostLoginPath } from './paths';
import { sessionQueryOptions } from './queries';

export async function guestOnlyLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  return session ? redirect(getPostLoginPath(session)) : null;
}

export async function changePasswordLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(AUTH_PATHS.login);
  if (!session.mustChangePassword) return redirect(AUTH_PATHS.afterLogin);
  return session;
}

export async function protectedLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(AUTH_PATHS.login);
  if (session.mustChangePassword) return redirect(AUTH_PATHS.changePassword);
  return session;
}
