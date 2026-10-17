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
  type SchoolInput,
  type SchoolListParams,
} from './api/api';

export const schoolKeys = {
  all: ['schools'] as const,
  list: (params: SchoolListParams) => [...schoolKeys.all, 'list', params] as const,
};

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
