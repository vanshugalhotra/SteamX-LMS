import { useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { SubscriptionFormLayout } from '../components/SubscriptionFormLayout';
import { useSubscription } from '../queries';

const PAGE_COPY = {
  edit: {
    title: 'Edit subscription',
    subtitle: 'Update the subscription end date or delivery limit.',
  },
  renew: {
    title: 'Renew subscription',
    subtitle: 'Add a new term for this school and course.',
  },
} as const;

export function SubscriptionTermPage({ mode }: { mode: 'edit' | 'renew' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: subscription, isPending, error, refetch } = useSubscription(id);
  const backToDirectory = () => {
    void navigate(PATHS.admin.subscriptions);
  };
  const pageCopy = PAGE_COPY[mode];

  let content;
  if (isPending) {
    content = (
      <div
        className="h-48 animate-pulse rounded-xl bg-gray-100"
        role="status"
        aria-label="Loading subscription"
      />
    );
  } else if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    content = (
      <div className="space-y-3">
        <Alert>{notFound ? 'Subscription not found.' : getErrorMessage(error)}</Alert>
        {!notFound && (
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  } else {
    content = (
      <SubscriptionForm
        key={subscription.id}
        mode={mode}
        subscription={subscription}
        onDone={backToDirectory}
        onCancel={backToDirectory}
      />
    );
  }

  return (
    <SubscriptionFormLayout
      title={pageCopy.title}
      subtitle={pageCopy.subtitle}
      backLabel={subscription?.courseTitle ?? 'Subscriptions'}
    >
      {content}
    </SubscriptionFormLayout>
  );
}
