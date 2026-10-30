import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCourseModule,
  deleteCourseModule,
  fetchCourseModule,
  fetchCourseModules,
  reorderCourseModules,
  updateCourseModule,
  updateCourseModuleStatus,
} from './api/api';
import type {
  CourseModuleListParams,
  CreateCourseModulePayload,
  ReorderCourseModulesPayload,
  UpdateCourseModulePayload,
} from './model/types';
import type { ContentStatus } from '../courses/model/types';
import { courseKeys } from '../courses/queries';

export const courseModuleKeys = {
  all: ['course-modules'] as const,
  list: (params: CourseModuleListParams) => [...courseModuleKeys.all, 'list', params] as const,
  detail: (id: string) => [...courseModuleKeys.all, 'detail', id] as const,
};

export function courseModulesQueryOptions(params: CourseModuleListParams) {
  return queryOptions({
    queryKey: courseModuleKeys.list(params),
    queryFn: () => fetchCourseModules(params.courseId),
    enabled: params.courseId !== '',
  });
}

export function useCourseModules(params: CourseModuleListParams) {
  return useQuery(courseModulesQueryOptions(params));
}

export function useCourseModule(id: string) {
  return useQuery({
    queryKey: courseModuleKeys.detail(id),
    queryFn: () => fetchCourseModule(id),
    enabled: id !== '',
  });
}

function useInvalidateCourseModules() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: courseModuleKeys.all }),
      queryClient.invalidateQueries({ queryKey: courseKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['lessons'] }),
    ]);
}

export function useCreateCourseModule() {
  const invalidate = useInvalidateCourseModules();
  return useMutation({
    mutationFn: ({ courseId, body }: { courseId: string; body: CreateCourseModulePayload }) =>
      createCourseModule(courseId, body),
    onSuccess: invalidate,
  });
}

export function useReorderCourseModules() {
  const invalidate = useInvalidateCourseModules();
  return useMutation({
    mutationFn: ({ courseId, body }: { courseId: string; body: ReorderCourseModulesPayload }) =>
      reorderCourseModules(courseId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCourseModule() {
  const invalidate = useInvalidateCourseModules();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCourseModulePayload }) =>
      updateCourseModule(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCourseModuleStatus() {
  const invalidate = useInvalidateCourseModules();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      updateCourseModuleStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteCourseModule() {
  const invalidate = useInvalidateCourseModules();
  return useMutation({ mutationFn: deleteCourseModule, onSuccess: invalidate });
}
