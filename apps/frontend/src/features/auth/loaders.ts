import { redirect } from 'react-router';
import { queryClient } from '@/lib/query-client';
import { getHomePath, getPostLoginPath } from './model/redirects';
import { sessionQueryOptions } from './queries';
import { PATHS } from '@/lib/paths';

export async function guestOnlyLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  return session ? redirect(getPostLoginPath(session)) : null;
}

export async function changePasswordLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(PATHS.login);
  if (!session.mustChangePassword) return redirect(getHomePath());
  return session;
}

export async function protectedLoader() {
  const session = await queryClient.query(sessionQueryOptions);
  if (!session) return redirect(PATHS.login);
  if (session.mustChangePassword) return redirect(PATHS.changePassword);
  return session;
}
