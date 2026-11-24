import type { ReactNode } from 'react';
import { UsersRound } from 'lucide-react';
import { getCourseAccent } from '@/features/admin/courses/config/course-accent';

interface DeliveryCardArtworkProps {
  delivery: {
    course: { id: string };
    label: string;
    academicYear: string;
  };
  children?: ReactNode;
}

export function DeliveryCardArtwork({ delivery, children }: DeliveryCardArtworkProps) {
  return (
    <div
      className={`relative grid min-h-36 place-items-center overflow-hidden p-4 text-center ${getCourseAccent(delivery.course.id)}`}
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
        <UsersRound className="mx-auto size-9" aria-hidden="true" />
        <p className="mt-3 text-xs font-semibold">
          {delivery.label} · {delivery.academicYear}
        </p>
      </div>
      {children}
    </div>
  );
}
