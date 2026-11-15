import { useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { SubscriptionFormLayout } from '../components/SubscriptionFormLayout';
import { useSubscription } from '../queries';

export function SubscriptionRenewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: subscription, isPending, error, refetch } = useSubscription(id);
  const backToDirectory = () => {
    void navigate(PATHS.admin.subscriptions);
  };

  const content = (() => {
    if (isPending) {
      return (
        <div
          className="h-48 animate-pulse rounded-xl bg-gray-100"
          role="status"
          aria-label="Loading subscription"
        />
      );
    }

    if (error) {
      const notFound = error instanceof ApiError && error.status === 404;
      return (
        <div className="space-y-3">
          <Alert>{notFound ? 'Subscription not found.' : getErrorMessage(error)}</Alert>
          {!notFound && (
            <Button variant="secondary" onClick={() => void refetch()}>
              Retry
            </Button>
          )}
        </div>
      );
    }

    return (
      <SubscriptionForm
        key={subscription.id}
        subscription={subscription}
        onDone={backToDirectory}
        onCancel={backToDirectory}
      />
    );
  })();

  return (
    <SubscriptionFormLayout
      title="Renew subscription"
      subtitle="Add a new term for this school and course."
      backLabel={subscription?.courseTitle ?? 'Subscriptions'}
    >
      {content}
    </SubscriptionFormLayout>
  );
}
