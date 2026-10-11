import { redirect } from 'react-router';
import { queryClient } from '@/lib/query-client';
import { getPostLoginPath } from './paths';
import { sessionQueryOptions } from './queries';

/** /login is for signed-out users; anyone already signed in is sent where they belong. */
export async function guestOnlyLoader() {
  // If the backend is unreachable we still want to show the login form (errors show on submit).
  const session = await queryClient.query(sessionQueryOptions).catch(() => null);
  return session ? redirect(getPostLoginPath(session)) : null;
}
