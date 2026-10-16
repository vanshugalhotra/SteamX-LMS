import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fetchSession, login, logout } from './api/api';
import { PATHS } from '@/lib/paths';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export const sessionQueryOptions = queryOptions({
  queryKey: ['auth', 'session'],
  queryFn: fetchSession,
  staleTime: 5 * 60_000,
  retry: false,
});

/** The cached session profile (loaded by the route loaders). */
export function useSession() {
  return useQuery(sessionQueryOptions).data;
}

// User data lives only in the TanStack Query cache, and queryClient.clear() removes all of it.
// If other in-memory user state is added later (e.g. a store), reset it here too.
export function clearSession(queryClient: QueryClient) {
  queryClient.clear();
  queryClient.setQueryData(sessionQueryOptions.queryKey, null);
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: (profile) => {
      queryClient.setQueryData(sessionQueryOptions.queryKey, profile);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const finishLogout = () => {
    clearSession(queryClient);
    void navigate(PATHS.login, { replace: true });
  };

  return useMutation({
    mutationFn: logout,
    onSuccess: finishLogout,
    onError: (error) => {
      // 401: the session is already gone, so the user is effectively logged out.
      if (error instanceof ApiError && error.status === 401) {
        finishLogout();
        return;
      }
      // Offline / 5xx: the cookie may still be valid, so stay here and let the user retry.
      toast.error("Couldn't log out. Please try again.", { id: 'logout-failed' });
    },
  });
}
