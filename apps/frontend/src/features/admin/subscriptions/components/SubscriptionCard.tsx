import { CreditCard, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/date-helper';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { toast } from 'sonner';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import type { Subscription } from '../model/types';
import { useRevokeSubscription } from '../queries';
import { getCourseAccent } from '@/features/admin/courses/config/course-accent';

const SUBSCRIPTION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

function formatSubscriptionDate(value: string) {
  return formatDate(`${value}T00:00:00`, 'en-GB', SUBSCRIPTION_DATE_FORMAT);
}

interface SubscriptionCardProps {
  subscription: Subscription;
}

export function SubscriptionCard({ subscription }: SubscriptionCardProps) {
  const [revokeOpen, setRevokeOpen] = useState(false);
  const revoke = useRevokeSubscription();
  const usage = Math.min(100, (subscription.activeDeliveries / subscription.maxDeliveries) * 100);
  const term = `${formatSubscriptionDate(subscription.startDate)} – ${formatSubscriptionDate(subscription.endDate)}`;
  const confirmRevoke = async () => {
    try {
      await revoke.mutateAsync(subscription.id);
      setRevokeOpen(false);
      toast.success('Subscription revoked');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <div
        className={cn(
          'relative grid min-h-36 place-items-center overflow-hidden p-4 text-center',
          getCourseAccent(subscription.courseId),
        )}
      >
        <span
          aria-hidden="true"
          className="absolute -left-5 top-8 size-20 rounded-full bg-white/25"
        />
        <span
          aria-hidden="true"
          className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20"
        />
        <div className="relative">
          <CreditCard className="mx-auto size-9" aria-hidden="true" />
          <p className="mt-3 text-xs font-semibold">{term}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">{subscription.courseTitle}</h2>
          <p className="mt-0.5 truncate text-[11px] text-gray-600">{subscription.schoolName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubscriptionStatusBadge status={subscription.status} />
          <span className="rounded-full bg-brand-chip px-2.5 py-1 text-[10px] font-semibold text-brand-navy">
            {String(subscription.activeDeliveries)} of {String(subscription.maxDeliveries)}{' '}
            deliveries
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Active deliveries used"
          aria-valuemin={0}
          aria-valuemax={subscription.maxDeliveries}
          aria-valuenow={subscription.activeDeliveries}
          className="h-1.5 overflow-hidden rounded-full bg-brand-chip"
        >
          <div
            className="h-full rounded-full bg-brand-teal"
            style={{ width: `${String(usage)}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            to={PATHS.admin.subscriptionEdit(subscription.id)}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </ButtonLink>
          <ButtonLink
            to={PATHS.admin.subscriptionRenew(subscription.id)}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Renew
          </ButtonLink>
          {subscription.status !== 'EXPIRED' && (
            <Button
              type="button"
              variant="dangerOutline"
              size="sm"
              className="flex-1"
              disabled={revoke.isPending}
              onClick={() => {
                setRevokeOpen(true);
              }}
            >
              Revoke
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={revokeOpen}
        title="Revoke this subscription?"
        description="Upcoming access will be removed. Current access will end immediately. This action cannot be undone."
        confirmLabel="Revoke subscription"
        pending={revoke.isPending}
        pendingLabel="Revoking…"
        onConfirm={() => {
          void confirmRevoke();
        }}
        onCancel={() => {
          if (!revoke.isPending) setRevokeOpen(false);
        }}
      />
    </article>
  );
}
