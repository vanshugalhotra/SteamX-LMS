import { useMemo } from 'react';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createSchool,
  fetchSchools,
  updateSchool,
  updateSchoolStatus,
  fetchSchool,
} from './api/api';
import { type SchoolInput, type SchoolListParams, type SchoolStatus } from './model/types';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { AsyncSearchResult } from '@/components/ui/async-select';

export const schoolKeys = {
  all: ['schools'] as const,
  list: (params: SchoolListParams) => [...schoolKeys.all, 'list', params] as const,
  detail: (id: string) => [...schoolKeys.all, 'detail', id] as const,
};

export function useSchool(id: string) {
  return useQuery({ queryKey: schoolKeys.detail(id), queryFn: () => fetchSchool(id) });
}

export function schoolsQueryOptions(params: SchoolListParams) {
  return queryOptions({
    queryKey: schoolKeys.list(params),
    queryFn: () => fetchSchools(params),
    // Keep the previous page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useSchools(params: SchoolListParams) {
  return useQuery(schoolsQueryOptions(params));
}

export function useCreateSchool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSchool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolKeys.all }),
  });
}

export function useUpdateSchool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SchoolInput }) => updateSchool(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolKeys.all }),
  });
}

export function useUpdateSchoolStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SchoolStatus }) =>
      updateSchoolStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schoolKeys.all }),
  });
}

/** id -> name for all schools (the backend caps `limit` at 100). */
// TODO: replace with a lookup endpoint or an expanded `school` field in the users list.
export function useSchoolNames() {
  const { data } = useSchools({ page: 1, limit: 100, q: '', status: 'ALL' });
  return useMemo(() => new Map((data?.items ?? []).map((s) => [s.id, s.name])), [data]);
}

function useSchoolSearchBy(search: string, status: 'ACTIVE' | 'ALL'): AsyncSearchResult {
  const q = useDebouncedValue(search.trim());
  const { data, isPending, isError } = useSchools({ page: 1, limit: 20, q, status });
  const options = useMemo(
    () => (data?.items ?? []).map((s) => ({ value: s.id, label: s.name, description: s.code })),
    [data],
  );
  return { options, isPending, isError };
}

/** For forms: only active schools can get new users. */
export const useSchoolSearch = (search: string) => useSchoolSearchBy(search, 'ACTIVE');
/** For filters: every school. */
export const useAnySchoolSearch = (search: string) => useSchoolSearchBy(search, 'ALL');
