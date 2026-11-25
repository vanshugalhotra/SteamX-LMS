import { Link } from 'react-router';
import { DeliveryCardArtwork } from '@/features/deliveries/components/DeliveryCardArtwork';
import { DeliveryStatusBadges } from '@/features/deliveries/components/DeliveryStatusBadges';
import { PATHS } from '@/lib/paths';
import type { TeacherDelivery } from '../model/types';

export function TeacherDeliveryCard({ delivery }: { delivery: TeacherDelivery }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <Link
        to={PATHS.teacher.delivery(delivery.id)}
        aria-label={`Open ${delivery.displayName}`}
        className="block rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <DeliveryCardArtwork delivery={delivery} />
        <div className="space-y-3 p-4">
          {/* TODO: Show school name and class when the teacher delivery response includes them. */}
          <h3 className="truncate text-[13px] font-semibold">{delivery.course.title}</h3>
          <DeliveryStatusBadges
            status={delivery.status}
            subscriptionActive={delivery.subscriptionActive}
          />
        </div>
      </Link>
    </article>
  );
}
