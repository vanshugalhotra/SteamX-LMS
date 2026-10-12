import { redirect } from 'react-router';
import { queryClient } from '@/lib/query-client';
import { getPostLoginPath } from './paths';
import { sessionQueryOptions } from './queries';

export async function guestOnlyLoader() {
  const session = await queryClient.query(sessionQueryOptions).catch((error: unknown) => {
    if (import.meta.env.DEV) console.error('[guestOnlyLoader] session check failed', error);
    return null;
  });
  return session ? redirect(getPostLoginPath(session)) : null;
}
