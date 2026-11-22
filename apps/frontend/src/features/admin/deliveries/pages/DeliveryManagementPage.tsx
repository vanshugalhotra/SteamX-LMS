import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { DeliveryStudentsPanel } from '../components/DeliveryStudentsPanel';
import { DeliveryTeachersPanel } from '../components/DeliveryTeachersPanel';
import { useDelivery } from '../queries';

function DeliveryPageError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div role="alert" className="space-y-3">
      <Alert>{notFound ? 'Delivery not found.' : getErrorMessage(error)}</Alert>
      {!notFound && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function DeliveryManagementPage() {
  const { id = '', kind = '' } = useParams();
  const { data: delivery, isPending, error, refetch } = useDelivery(id);
  const isTeacherPage = kind === 'teachers';
  const validKind = isTeacherPage || kind === 'students';
  const title = isTeacherPage ? 'Assign teachers' : 'Enroll students';
  const subtitle = isTeacherPage
    ? 'Assign teachers from this school to the delivery.'
    : 'Enroll active students from this school in the delivery.';

  let content;
  if (!id || !validKind) {
    content = <Alert>This delivery management page could not be found.</Alert>;
  } else if (isPending) {
    content = (
      <p role="status" className="p-8 text-center text-sm text-gray-600">
        Loading delivery…
      </p>
    );
  } else if (error) {
    content = <DeliveryPageError error={error} onRetry={() => void refetch()} />;
  } else {
    content = (
      isTeacherPage ? (
        <DeliveryTeachersPanel delivery={delivery} />
      ) : (
        <DeliveryStudentsPanel delivery={delivery} />
      )
    );
  }

  return (
    <FormPageLayout
      title={title}
      subtitle={delivery ? `${delivery.displayName} · ${subtitle}` : subtitle}
      backTo={PATHS.admin.deliveries}
      backLabel="Deliveries"
      tag={
        delivery
          ? delivery.subscriptionActive
            ? 'Subscription active'
            : 'Subscription inactive'
          : undefined
      }
      tagVariant={delivery?.subscriptionActive ? 'success' : 'warning'}
    >
      {content}
    </FormPageLayout>
  );
}
