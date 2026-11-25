import { getStudentLessonReleaseProgress } from '../model/release-progress';
import { DeliveryStatusBadges } from './DeliveryStatusBadges';
import type { DeliveryStatus, ReleaseOutlineResponse } from '../model/types';

export function DeliveryStudentLessonProgress({
  outline,
  compact = false,
  delivery,
}: {
  outline: ReleaseOutlineResponse;
  compact?: boolean;
  delivery?: { status: DeliveryStatus; subscriptionActive: boolean };
}) {
  const { released, total } = getStudentLessonReleaseProgress(outline);
  const progress = total === 0 ? 0 : Math.round((released / total) * 100);

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={compact ? 'text-[11px] text-gray-600' : 'text-sm font-medium'}>
          {total === 0
            ? 'No releasable student lessons'
            : `${String(released)} of ${String(total)} ${compact ? 'lessons' : 'student lessons'} released`}
        </p>
        {delivery && (
          <DeliveryStatusBadges
            status={delivery.status}
            subscriptionActive={delivery.subscriptionActive}
          />
        )}
      </div>
      {total > 0 && (
        <div
          role="progressbar"
          aria-label="Student lesson release progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={released}
          className="h-2 overflow-hidden rounded-full bg-gray-100"
        >
          <div
            className="h-full rounded-full bg-brand-teal transition-[width]"
            style={{ width: `${String(progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}
