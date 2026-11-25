import { Badge } from '@/components/ui/badge';
import type { DeliveryStatus } from '../model/types';

export function DeliveryStatusBadges({
  status,
  subscriptionActive,
}: {
  status: DeliveryStatus;
  subscriptionActive: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status === 'ACTIVE' ? 'success' : 'neutral'}>
        {status === 'ACTIVE' ? 'Active' : 'Inactive'}
      </Badge>
      <Badge variant={subscriptionActive ? 'success' : 'warning'}>
        {subscriptionActive ? 'Subscription active' : 'Subscription inactive'}
      </Badge>
    </div>
  );
}
