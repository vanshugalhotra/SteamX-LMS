import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDelivery,
  fetchDeliveryReleaseOutline,
  releaseDeliveryLesson,
  releaseDeliveryModule,
  unreleaseDeliveryLesson,
} from './api/api';

export const deliveryReadKeys = {
  all: ['deliveries'] as const,
  detail: (id: string) => ['deliveries', 'detail', id] as const,
  releaseOutline: (deliveryId: string) => ['deliveries', 'release-outline', deliveryId] as const,
};

export function useDelivery(id: string) {
  return useQuery({
    queryKey: deliveryReadKeys.detail(id),
    queryFn: () => fetchDelivery(id),
    enabled: id !== '',
  });
}

export function deliveryReleaseOutlineQueryOptions(deliveryId: string) {
  return queryOptions({
    queryKey: deliveryReadKeys.releaseOutline(deliveryId),
    queryFn: () => fetchDeliveryReleaseOutline(deliveryId),
    enabled: deliveryId !== '',
  });
}

export function useDeliveryReleaseOutline(deliveryId: string) {
  return useQuery(deliveryReleaseOutlineQueryOptions(deliveryId));
}

function useInvalidateDeliveryReleaseOutline() {
  const queryClient = useQueryClient();
  return (deliveryId: string) =>
    queryClient.invalidateQueries({ queryKey: deliveryReadKeys.releaseOutline(deliveryId) });
}

export function useReleaseDeliveryLesson() {
  const invalidate = useInvalidateDeliveryReleaseOutline();
  return useMutation({
    mutationFn: ({ deliveryId, lessonId }: { deliveryId: string; lessonId: string }) =>
      releaseDeliveryLesson(deliveryId, lessonId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export function useUnreleaseDeliveryLesson() {
  const invalidate = useInvalidateDeliveryReleaseOutline();
  return useMutation({
    mutationFn: ({ deliveryId, lessonId }: { deliveryId: string; lessonId: string }) =>
      unreleaseDeliveryLesson(deliveryId, lessonId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}

export function useUnreleaseDeliveryModule() {
  const invalidate = useInvalidateDeliveryReleaseOutline();
  return useMutation({
    mutationFn: async ({ deliveryId, lessonIds }: { deliveryId: string; lessonIds: string[] }) => {
      const results = await Promise.allSettled(
        lessonIds.map((lessonId) => unreleaseDeliveryLesson(deliveryId, lessonId)),
      );
      const failures: unknown[] = [];
      for (const result of results) {
        if (result.status === 'rejected') failures.push(result.reason);
      }
      return {
        succeeded: results.length - failures.length,
        failures,
      };
    },
    onSettled: (_data, _error, variables) => invalidate(variables.deliveryId),
  });
}

export function useReleaseDeliveryModule() {
  const invalidate = useInvalidateDeliveryReleaseOutline();
  return useMutation({
    mutationFn: ({ deliveryId, moduleId }: { deliveryId: string; moduleId: string }) =>
      releaseDeliveryModule(deliveryId, moduleId),
    onSuccess: (_data, variables) => invalidate(variables.deliveryId),
  });
}
