import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchDelivery, fetchDeliveryReleaseOutline } from './api/api';

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
