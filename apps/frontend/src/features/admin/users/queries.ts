import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  createStudent,
  createTeacher,
  fetchUser,
  fetchUsers,
  updateUser,
  updateUserStatus,
} from './api/api';
import type { UpdateUserPayload, UserListParams, UserStatus } from './model/types';
import type { AsyncSearchResult } from '@/components/ui/async-select';
import { useDebouncedValue } from '@/lib/use-debounced-value';

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

function useActiveSchoolUserSearch(
  search: string,
  schoolId: string,
  role: 'teacher' | 'student',
): AsyncSearchResult {
  const q = useDebouncedValue(search.trim());
  const { data, isPending, isError } = useQuery({
    ...usersQueryOptions({
      page: 1,
      limit: 20,
      q,
      role,
      status: 'ACTIVE',
      schoolId,
    }),
    enabled: schoolId !== '',
  });
  const options = useMemo(
    () =>
      (data?.items ?? []).map((teacher) => ({
        value: teacher.id,
        label: teacher.name,
        description: teacher.steamxId,
      })),
    [data],
  );
  return { options, isPending, isError };
}

/** Searches active teachers within the selected delivery's school. */
export function useActiveTeacherSearch(search: string, schoolId: string): AsyncSearchResult {
  return useActiveSchoolUserSearch(search, schoolId, 'teacher');
}

/** Searches active students within the selected delivery's school. */
export function useActiveStudentSearch(search: string, schoolId: string): AsyncSearchResult {
  return useActiveSchoolUserSearch(search, schoolId, 'student');
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
