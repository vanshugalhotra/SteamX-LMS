import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createDelivery,
  fetchDeliveries,
  fetchDelivery,
  updateDeliveryLabel,
  updateDeliveryStatus,
} from './api/api';
import type {
  CreateDeliveryPayload,
  DeliveryListParams,
  DeliveryStatus,
  UpdateDeliveryLabelPayload,
} from './model/types';

export const deliveryKeys = {
  all: ['deliveries'] as const,
  list: (params: DeliveryListParams) => [...deliveryKeys.all, 'list', params] as const,
  detail: (id: string) => [...deliveryKeys.all, 'detail', id] as const,
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

function useInvalidateDeliveries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
}

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
