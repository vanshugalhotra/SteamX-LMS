import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fetchSession, login, logout } from './api';
import { AUTH_PATHS } from './paths';

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

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionQueryOptions.queryKey, null);
      void navigate(AUTH_PATHS.login, { replace: true });
    },
  });
}
