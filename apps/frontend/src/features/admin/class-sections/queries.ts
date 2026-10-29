import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AsyncSearchResult } from '@/components/ui/async-select';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  fetchClassSection,
  fetchClassSections,
  createClassSection,
  updateClassSection,
  deleteClassSection,
} from './api/api';
import { classSectionLabel } from './model/types';
import type { UpdateClassSectionPayload } from './model/types';
import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';

export const classSectionKeys = { all: ['class-sections'] as const };

export interface ClassSectionListParams {
  page: number;
  limit: number;
  q: string;
  schoolId: string;
}

export function useClassSections(params: ClassSectionListParams) {
  return useQuery({
    queryKey: [...classSectionKeys.all, 'list', params],
    queryFn: () => fetchClassSections(params),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateClassSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateClassSectionPayload }) =>
      updateClassSection(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classSectionKeys.all }),
  });
}

export function useDeleteClassSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteClassSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classSectionKeys.all }),
  });
}

/** Debounced class-section search inside one school (empty until a school is chosen). */
export function useClassSectionSearch(search: string, schoolId: string): AsyncSearchResult {
  const q = useDebouncedValue(search.trim());
  const { data, isPending, isError } = useQuery({
    queryKey: [...classSectionKeys.all, 'search', schoolId, q],
    queryFn: () => fetchClassSections({ page: 1, limit: 20, q, schoolId }),
    enabled: schoolId !== '',
  });
  const options = useMemo(
    () => (data?.items ?? []).map((c) => ({ value: c.id, label: classSectionLabel(c) })),
    [data],
  );
  return { options, isPending: schoolId !== '' && isPending, isError };
}

export function useClassSection(id: string) {
  return useQuery({
    queryKey: [...classSectionKeys.all, 'detail', id],
    queryFn: () => fetchClassSection(id),
    enabled: id !== '',
  });
}

export function useCreateClassSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createClassSection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classSectionKeys.all }),
  });
}
