import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormPageLayout } from '@/components/form/FormPageLayout';
import { DeliveryReleaseOutline } from '@/features/deliveries/components/DeliveryReleaseOutline';
import { DeliveryStudentLessonProgress } from '@/features/deliveries/components/DeliveryStudentLessonProgress';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { useDelivery, useDeliveryReleaseOutline } from '@/features/deliveries/queries';

function DeliveryPageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-3">
      <Alert>{notFound ? 'Delivery not found.' : getErrorMessage(error)}</Alert>
      {!notFound && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function TeacherDeliveryPage() {
  const { id = '' } = useParams();
  const deliveryQuery = useDelivery(id);
  const outlineQuery = useDeliveryReleaseOutline(id);
  const delivery = deliveryQuery.data;
  const outline = outlineQuery.data;
  const error = deliveryQuery.error ?? outlineQuery.error;
  const retry = () => {
    void Promise.all([deliveryQuery.refetch(), outlineQuery.refetch()]);
  };

  let content;
  if (!id) {
    content = <Alert>Delivery not found.</Alert>;
  } else if (deliveryQuery.isPending || outlineQuery.isPending) {
    content = (
      <p role="status" className="p-8 text-center text-sm text-gray-600">
        Loading delivery details…
      </p>
    );
  } else if (error) {
    content = <DeliveryPageError error={error} onRetry={retry} />;
  } else if (!delivery || !outline) {
    content = <Alert>Delivery details could not be loaded.</Alert>;
  } else {
    content = (
      <div className="space-y-7">
        <section
          aria-label="Student lesson release progress"
          className="rounded-3xl bg-gray-50 p-5"
        >
          <DeliveryStudentLessonProgress
            outline={outline}
            delivery={{ status: delivery.status, subscriptionActive: delivery.subscriptionActive }}
          />
        </section>
        <section aria-label="Course modules">
          <DeliveryReleaseOutline outline={outline} />
        </section>
      </div>
    );
  }

  const pageTitle = delivery?.displayName ?? 'Delivery details';
  const pageSubtitle = delivery
    ? 'Review lesson progress and view the active course outline.'
    : 'View delivery information and its release outline.';

  return (
    <FormPageLayout
      title={pageTitle}
      subtitle={pageSubtitle}
      backTo={PATHS.teacher.deliveries}
      backLabel="My Deliveries"
      className="max-w-6xl"
    >
      {content}
    </FormPageLayout>
  );
}
