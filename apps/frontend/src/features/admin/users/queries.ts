import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createStudent,
  createTeacher,
  fetchUser,
  fetchUsers,
  updateUser,
  updateUserStatus,
} from './api/api';
import type { UpdateUserPayload, UserListParams, UserStatus } from './model/types';

export const userKeys = {
  all: ['users'] as const,
  list: (params: UserListParams) => [...userKeys.all, 'list', params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

export function usersQueryOptions(params: UserListParams) {
  return queryOptions({
    queryKey: userKeys.list(params),
    queryFn: () => fetchUsers(params),
    placeholderData: keepPreviousData,
  });
}

export function useUsers(params: UserListParams) {
  return useQuery(usersQueryOptions(params));
}

export function useUser(id: string) {
  return useQuery({ queryKey: userKeys.detail(id), queryFn: () => fetchUser(id) });
}

// Every mutation invalidates `userKeys.all`, so lists and details refresh together.
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: userKeys.all });
}

export function useCreateTeacher() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: createTeacher, onSuccess: invalidate });
}

export function useCreateStudent() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: createStudent, onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserPayload }) => updateUser(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateUserStatus() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      updateUserStatus(id, status),
    onSuccess: invalidate,
  });
}
