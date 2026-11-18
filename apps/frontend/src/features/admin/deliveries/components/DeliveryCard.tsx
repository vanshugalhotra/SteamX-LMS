import { UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getCourseAccent } from '@/features/admin/courses/config/course-accent';
import type { Delivery } from '../model/types';

interface DeliveryCardProps {
  delivery: Delivery;
  schoolName: string;
}

export function DeliveryCard({ delivery, schoolName }: DeliveryCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <div
        className={`relative grid min-h-36 place-items-center overflow-hidden p-4 text-center ${getCourseAccent(delivery.course.id)}`}
      >
        <span aria-hidden="true" className="absolute -left-5 top-8 size-20 rounded-full bg-white/25" />
        <span aria-hidden="true" className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20" />
        <div className="relative">
          <UsersRound className="mx-auto size-9" aria-hidden="true" />
          <p className="mt-3 text-xs font-semibold">
            {delivery.label} · {delivery.academicYear}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">{delivery.course.title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-gray-600">{schoolName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={delivery.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {delivery.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant={delivery.subscriptionActive ? 'success' : 'warning'}>
            {delivery.subscriptionActive ? 'Subscription active' : 'Subscription inactive'}
          </Badge>
        </div>
      </div>
    </article>
  );
}
