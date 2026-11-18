import type { SubscriptionStatusFilter } from '../model/types';

export const SUBSCRIPTIONS_PAGE_SIZE = 6;

export const SUBSCRIPTION_STATUS_FILTERS: { value: SubscriptionStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'EXPIRED', label: 'Expired' },
];
