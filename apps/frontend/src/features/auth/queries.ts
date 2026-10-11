import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSession, login } from './api';

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
