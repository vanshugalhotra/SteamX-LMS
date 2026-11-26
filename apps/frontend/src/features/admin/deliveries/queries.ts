import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  assignDeliveryTeacher,
  createDelivery,
  fetchDeliveries,
  fetchDelivery,
  fetchDeliveryTeachers,
  fetchDeliveryEnrollments,
  enrollDeliveryStudents,
  removeDeliveryTeacher,
  removeDeliveryStudent,
  updateDeliveryLabel,
  updateDeliveryStatus,
} from './api/api';
import { deliveryReadKeys } from '@/features/deliveries/queries';
import type {
  CreateDeliveryPayload,
  DeliveryEnrollmentListParams,
  DeliveryListParams,
  DeliveryStatus,
  DeliveryTeacherListParams,
  EnrollDeliveryStudentsPayload,
  UpdateDeliveryLabelPayload,
} from './model/types';

export const deliveryKeys = {
  all: ['deliveries'] as const,
  list: (params: DeliveryListParams) => [...deliveryKeys.all, 'list', params] as const,
  detail: (id: string) => [...deliveryKeys.all, 'detail', id] as const,
  teachers: (params: DeliveryTeacherListParams) =>
    [...deliveryKeys.all, 'teachers', params] as const,
  enrollments: (params: DeliveryEnrollmentListParams) =>
    [...deliveryKeys.all, 'enrollments', params] as const,
  releaseOutline: deliveryReadKeys.releaseOutline,
  lessonMutations: ['deliveries', 'lesson-mutations'] as const,
  moduleMutations: ['deliveries', 'module-mutations'] as const,
};

export function deliveriesQueryOptions(params: DeliveryListParams) {
  return queryOptions({
    queryKey: deliveryKeys.list(params),
    queryFn: () => fetchDeliveries(params),
    placeholderData: keepPreviousData,
  });
}

export function useDeliveries(params: DeliveryListParams) {
  return useQuery(deliveriesQueryOptions(params));
}

export function useDelivery(id: string) {
  return useQuery({
    queryKey: deliveryKeys.detail(id),
    queryFn: () => fetchDelivery(id),
    enabled: id !== '',
  });
}

export function useDeliveryTeachers(params: DeliveryTeacherListParams) {
  return useQuery({
    queryKey: deliveryKeys.teachers(params),
    queryFn: () => fetchDeliveryTeachers(params),
    enabled: params.deliveryId !== '',
  });
}

export function useDeliveryEnrollments(params: DeliveryEnrollmentListParams) {
  return useQuery({
    queryKey: deliveryKeys.enrollments(params),
    queryFn: () => fetchDeliveryEnrollments(params),
    enabled: params.deliveryId !== '',
  });
}

function useInvalidateDeliveries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
}

function useInvalidateDeliveryTeachers() {
  const queryClient = useQueryClient();
  return (deliveryId: string) =>
    queryClient.invalidateQueries({
      queryKey: [...deliveryKeys.all, 'teachers', { deliveryId }],
    });
}

function useInvalidateDeliveryEnrollments() {
  const queryClient = useQueryClient();
  return (deliveryId: string) =>
    queryClient.invalidateQueries({
      queryKey: [...deliveryKeys.all, 'enrollments', { deliveryId }],
    });
}

export function useAssignDeliveryTeacher() {
  const invalidate = useInvalidateDeliveryTeachers();
  return useMutation({
    mutationFn: ({ deliveryId, teacherId }: { deliveryId: string; teacherId: string }) =>
      assignDeliveryTeacher(deliveryId, teacherId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export function useRemoveDeliveryTeacher() {
  const invalidate = useInvalidateDeliveryTeachers();
  return useMutation({
    mutationFn: ({ deliveryId, teacherId }: { deliveryId: string; teacherId: string }) =>
      removeDeliveryTeacher(deliveryId, teacherId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export function useEnrollDeliveryStudents() {
  const invalidate = useInvalidateDeliveryEnrollments();
  return useMutation({
    mutationFn: ({
      deliveryId,
      body,
    }: {
      deliveryId: string;
      body: EnrollDeliveryStudentsPayload;
    }) => enrollDeliveryStudents(deliveryId, body),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export function useRemoveDeliveryStudent() {
  const invalidate = useInvalidateDeliveryEnrollments();
  return useMutation({
    mutationFn: ({ deliveryId, studentId }: { deliveryId: string; studentId: string }) =>
      removeDeliveryStudent(deliveryId, studentId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export {
  deliveryReleaseOutlineQueryOptions,
  useDeliveryReleaseOutline,
  useReleaseDeliveryLesson,
  useReleaseDeliveryModule,
  useUnreleaseDeliveryModule,
  useUnreleaseDeliveryLesson,
} from '@/features/deliveries/queries';

export function useCreateDelivery() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: (payload: CreateDeliveryPayload) => createDelivery(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateDeliveryLabel() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeliveryLabelPayload }) =>
      updateDeliveryLabel(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateDeliveryStatus() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DeliveryStatus }) =>
      updateDeliveryStatus(id, status),
    onSuccess: invalidate,
  });
}
