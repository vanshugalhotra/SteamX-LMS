import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fetchSession, login, logout } from './api/api';
import { AUTH_PATHS } from './model/paths';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

export const sessionQueryOptions = queryOptions({
  queryKey: ['auth', 'session'],
  queryFn: fetchSession,
  staleTime: 5 * 60_000,
  retry: false,
});

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
    queryClient.clear(); // drop all cached user data
    queryClient.setQueryData(sessionQueryOptions.queryKey, null);
    void navigate(AUTH_PATHS.login, { replace: true });
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
