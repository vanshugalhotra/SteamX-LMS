import { apiFetch } from '@/lib/api-client';
import type { Paginated } from '@/lib/pagination';
import type {
  CreateSubscriptionPayload,
  RenewSubscriptionPayload,
  Subscription,
  SubscriptionListParams,
  UpdateSubscriptionPayload,
} from '../model/types';
import { SUBSCRIPTION_ENDPOINTS } from './endpoints';

export function buildSubscriptionListSearchParams(params: SubscriptionListParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.schoolId) search.set('schoolId', params.schoolId);
  if (params.courseId) search.set('courseId', params.courseId);
  if (params.status) search.set('status', params.status);
  return search;
}

/** GET /subscriptions */
export function fetchSubscriptions(params: SubscriptionListParams) {
  const search = buildSubscriptionListSearchParams(params);
  return apiFetch<Paginated<Subscription>>(`${SUBSCRIPTION_ENDPOINTS.list}?${search.toString()}`);
}

/** GET /subscriptions/:id */
export function fetchSubscription(id: string) {
  return apiFetch<Subscription>(SUBSCRIPTION_ENDPOINTS.byId(id));
}

/** POST /subscriptions */
export function createSubscription(payload: CreateSubscriptionPayload) {
  return apiFetch<Subscription>(SUBSCRIPTION_ENDPOINTS.list, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /subscriptions/:id */
export function updateSubscription(id: string, payload: UpdateSubscriptionPayload) {
  return apiFetch<Subscription>(SUBSCRIPTION_ENDPOINTS.byId(id), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** POST /subscriptions/:id/revoke */
export function revokeSubscription(id: string) {
  return apiFetch<null>(SUBSCRIPTION_ENDPOINTS.revoke(id), { method: 'POST' });
}

/** POST /subscriptions/:id/renew */
export function renewSubscription(id: string, payload: RenewSubscriptionPayload) {
  return apiFetch<Subscription>(SUBSCRIPTION_ENDPOINTS.renew(id), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
