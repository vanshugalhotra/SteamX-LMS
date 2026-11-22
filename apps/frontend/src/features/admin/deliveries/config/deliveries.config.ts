import type { FilterOption } from '@/components/list/ListToolbar';
import type { DeliveryStatus } from '../model/types';

export const DELIVERIES_PAGE_SIZE = 20;
export const DELIVERY_ASSIGNMENTS_PAGE_SIZE = 20;

export type DeliveryStatusFilter = DeliveryStatus | 'ALL';

export const DELIVERY_STATUS_FILTERS: FilterOption<DeliveryStatusFilter>[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];
