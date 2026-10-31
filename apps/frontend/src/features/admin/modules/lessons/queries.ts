import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createLesson,
  deleteLesson,
  fetchLesson,
  fetchLessonContent,
  fetchLessons,
  reorderLessons,
  saveLessonContent,
  updateLesson,
  updateLessonStatus,
} from './api/api';
import type {
  CreateLessonPayload,
  LessonListParams,
  ReorderLessonsPayload,
  SaveLessonContentPayload,
  UpdateLessonPayload,
} from './model/types';
import type { ContentStatus } from '@/lib/content-status';

export const lessonKeys = {
  all: ['lessons'] as const,
  list: (params: LessonListParams) => [...lessonKeys.all, 'list', params] as const,
  detail: (id: string) => [...lessonKeys.all, 'detail', id] as const,
  content: (id: string) => [...lessonKeys.all, 'content', id] as const,
};

export function lessonsQueryOptions(params: LessonListParams) {
  return queryOptions({
    queryKey: lessonKeys.list(params),
    queryFn: () => fetchLessons(params),
    enabled: params.moduleId !== '',
  });
}

export function useLessons(params: LessonListParams) {
  return useQuery(lessonsQueryOptions(params));
}

export function useLesson(id: string) {
  return useQuery({
    queryKey: lessonKeys.detail(id),
    queryFn: () => fetchLesson(id),
    enabled: id !== '',
  });
}

export function useLessonContent(id: string) {
  return useQuery({
    queryKey: lessonKeys.content(id),
    queryFn: () => fetchLessonContent(id),
    enabled: id !== '',
  });
}

function useInvalidateLessons() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: lessonKeys.all }),
      // Keep these keys in sync with the course and module query-key factories.
      queryClient.invalidateQueries({ queryKey: ['course-modules'] }),
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
    ]);
}

export function useCreateLesson() {
  const invalidate = useInvalidateLessons();
  return useMutation({
    mutationFn: ({ moduleId, body }: { moduleId: string; body: CreateLessonPayload }) =>
      createLesson(moduleId, body),
    onSuccess: invalidate,
  });
}

export function useReorderLessons() {
  const invalidate = useInvalidateLessons();
  return useMutation({
    mutationFn: ({ moduleId, body }: { moduleId: string; body: ReorderLessonsPayload }) =>
      reorderLessons(moduleId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateLesson() {
  const invalidate = useInvalidateLessons();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLessonPayload }) => updateLesson(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateLessonStatus() {
  const invalidate = useInvalidateLessons();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      updateLessonStatus(id, status),
    onSuccess: invalidate,
  });
}

export function useDeleteLesson() {
  const invalidate = useInvalidateLessons();
  return useMutation({ mutationFn: deleteLesson, onSuccess: invalidate });
}

export function useSaveLessonContent() {
  const invalidate = useInvalidateLessons();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveLessonContentPayload }) =>
      saveLessonContent(id, body),
    onSuccess: invalidate,
  });
}
