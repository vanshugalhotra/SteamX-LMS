import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { DeliveryStudentLessonProgress } from '@/features/deliveries/components/DeliveryStudentLessonProgress';
import { DeliveryCardArtwork } from '@/features/deliveries/components/DeliveryCardArtwork';
import { DeliveryStatusBadges } from '@/features/deliveries/components/DeliveryStatusBadges';
import { useDeliveryReleaseOutline } from '@/features/deliveries/queries';
import { PATHS } from '@/lib/paths';
import type { TeacherDelivery } from '../model/types';

export function TeacherDeliveryCard({ delivery }: { delivery: TeacherDelivery }) {
  const outline = useDeliveryReleaseOutline(delivery.id);

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <Link
        to={PATHS.teacher.delivery(delivery.id)}
        aria-label={`Open ${delivery.displayName}`}
        className="block rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <DeliveryCardArtwork delivery={delivery} />
        <div className="space-y-3 p-4">
          {/* TODO: Show school and enrolled-student details when the teacher delivery API provides them. */}
          <h3 className="truncate text-[13px] font-semibold">{delivery.course.title}</h3>
          <DeliveryStatusBadges
            status={delivery.status}
            subscriptionActive={delivery.subscriptionActive}
          />
        </div>
      </Link>
      <div className="space-y-3 px-4 pb-4">
        {outline.isPending ? (
          <p role="status" className="text-[11px] text-gray-600">
            Loading lesson progress…
          </p>
        ) : outline.isError ? (
          <div className="space-y-2">
            <Alert>Lesson progress couldn&apos;t be loaded.</Alert>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void outline.refetch()}
            >
              Retry progress
            </Button>
          </div>
        ) : (
          <DeliveryStudentLessonProgress outline={outline.data} compact />
        )}
        <ButtonLink
          to={PATHS.teacher.delivery(delivery.id)}
          variant="default"
          size="default"
          className="w-full rounded-full bg-brand-coral text-sm font-semibold text-white hover:bg-brand-coral hover:brightness-95"
        >
          Release lessons
        </ButtonLink>
      </div>
    </article>
  );
}
