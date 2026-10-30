import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createCourse,
  deleteCourse,
  fetchCourse,
  fetchCourses,
  fetchCourseOutline,
  updateCourse,
  updateCourseStatus,
} from './api/api';
import type { CourseListParams, ContentStatus, UpdateCoursePayload } from './model/types';

export const courseKeys = {
  all: ['courses'] as const,
  list: (params: CourseListParams) => [...courseKeys.all, 'list', params] as const,
  detail: (id: string) => [...courseKeys.all, 'detail', id] as const,
  outline: (id: string) => [...courseKeys.all, 'outline', id] as const,
};

export function coursesQueryOptions(params: CourseListParams) {
  return queryOptions({
    queryKey: courseKeys.list(params),
    queryFn: () => fetchCourses(params),
    placeholderData: keepPreviousData,
  });
}

export function useCourses(params: CourseListParams) {
  return useQuery(coursesQueryOptions(params));
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: courseKeys.detail(id),
    queryFn: () => fetchCourse(id),
    enabled: id !== '',
  });
}

export function useCourseOutline(id: string) {
  return useQuery({
    queryKey: courseKeys.outline(id),
    queryFn: () => fetchCourseOutline(id),
    enabled: id !== '',
  });
}

function useInvalidateCourses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: courseKeys.all });
}

export function useCreateCourse() {
  const invalidate = useInvalidateCourses();
  return useMutation({ mutationFn: createCourse, onSuccess: invalidate });
}

export function useUpdateCourse() {
  const invalidate = useInvalidateCourses();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCoursePayload }) => updateCourse(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCourseStatus() {
  const invalidate = useInvalidateCourses();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      updateCourseStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteCourse() {
  const invalidate = useInvalidateCourses();
  return useMutation({ mutationFn: deleteCourse, onSuccess: invalidate });
}
