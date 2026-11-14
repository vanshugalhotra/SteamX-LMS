import type { DataTableColumn } from '@/components/ui/data-table';
import { formatDate } from '@/lib/date-helper';
import { SubscriptionStatusBadge } from '../components/SubscriptionStatusBadge';
import type { Subscription, SubscriptionStatusFilter } from '../model/types';

export const SUBSCRIPTIONS_PAGE_SIZE = 10;

export const SUBSCRIPTION_STATUS_FILTERS: { value: SubscriptionStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'EXPIRED', label: 'Expired' },
];

const SUBSCRIPTION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

function formatSubscriptionDate(value: string) {
  return formatDate(`${value}T00:00:00`, 'en-GB', SUBSCRIPTION_DATE_FORMAT);
}

export const subscriptionColumns: DataTableColumn<Subscription>[] = [
  {
    key: 'school',
    header: 'School',
    width: '1.4fr',
    cell: (subscription) => <span className="font-semibold">{subscription.schoolName}</span>,
  },
  {
    key: 'course',
    header: 'Course',
    width: '1.4fr',
    mobileLabel: true,
    cell: (subscription) => subscription.courseTitle,
  },
  {
    key: 'term',
    header: 'Subscription term',
    width: '1.5fr',
    mobileLabel: true,
    cell: (subscription) =>
      `${formatSubscriptionDate(subscription.startDate)} – ${formatSubscriptionDate(subscription.endDate)}`,
  },
  {
    key: 'deliveries',
    header: 'Deliveries in use',
    width: '1fr',
    mobileLabel: true,
    cell: (subscription) =>
      `${String(subscription.activeDeliveries)} of ${String(subscription.maxDeliveries)}`,
  },
  {
    key: 'status',
    header: 'Status',
    width: '.8fr',
    cell: (subscription) => <SubscriptionStatusBadge status={subscription.status} />,
  },
];
