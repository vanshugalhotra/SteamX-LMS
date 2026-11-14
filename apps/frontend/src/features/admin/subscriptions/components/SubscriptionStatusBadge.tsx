import type { SubscriptionStatus } from '../model/types';

const STATUS_PRESENTATION: Record<SubscriptionStatus, { label: string; className: string }> = {
  UPCOMING: { label: 'Upcoming', className: 'bg-brand-draft text-brand-draft-ink' },
  ACTIVE: { label: 'Active', className: 'bg-brand-teal/20 text-teal-900' },
  EXPIRED: { label: 'Expired', className: 'bg-gray-200 text-gray-700' },
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const presentation = STATUS_PRESENTATION[status];

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}
