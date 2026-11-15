import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createSubscription,
  fetchSubscription,
  fetchSubscriptions,
  renewSubscription,
  revokeSubscription,
  updateSubscription,
} from './api/api';
import type {
  CreateSubscriptionPayload,
  RenewSubscriptionPayload,
  SubscriptionListParams,
  UpdateSubscriptionPayload,
} from './model/types';

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  list: (params: SubscriptionListParams) => [...subscriptionKeys.all, 'list', params] as const,
  detail: (id: string) => [...subscriptionKeys.all, 'detail', id] as const,
};

export function subscriptionsQueryOptions(params: SubscriptionListParams) {
  return queryOptions({
    queryKey: subscriptionKeys.list(params),
    queryFn: () => fetchSubscriptions(params),
    placeholderData: keepPreviousData,
  });
}

export function useSubscriptions(params: SubscriptionListParams) {
  return useQuery(subscriptionsQueryOptions(params));
}

export function useSubscription(id: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(id),
    queryFn: () => fetchSubscription(id),
    enabled: id !== '',
  });
}

/** Searches courses for the subscription directory filter. */
function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
}

export function useCreateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: (payload: CreateSubscriptionPayload) => createSubscription(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSubscriptionPayload }) =>
      updateSubscription(id, body),
    onSuccess: invalidate,
  });
}

export function useRenewSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RenewSubscriptionPayload }) =>
      renewSubscription(id, body),
    onSuccess: invalidate,
  });
}

export function useRevokeSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: revokeSubscription,
    onSuccess: invalidate,
  });
}
