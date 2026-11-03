import { useState } from 'react';
import { Archive, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/lib/api-errors';
import type { ContentStatus } from '@/lib/content-status';
import type { Course } from '../model/types';
import {
  getAllowedCourseStatusTransitions,
  type CourseStatusTransition,
} from '../model/status-transitions';
import { useUpdateCourseStatus } from '../queries';
import { CourseStatusBadge } from './CourseStatusBadge';
import { COURSE_STATUSES, courseStatuses } from '../config/courses.config';

const actionLabel: Record<CourseStatusTransition, string> = {
  ACTIVE: 'Publish',
  ARCHIVED: 'Archive',
};

const statusIcon: Partial<Record<CourseStatusTransition, typeof Check>> = {
  ACTIVE: Check,
  ARCHIVED: Archive,
};

function confirmationDescription(course: Course, next: ContentStatus) {
  if (next === 'ACTIVE') {
    return `“${course.title}” will be published and made available for use.`;
  }
  if (next === 'ARCHIVED') {
    return `“${course.title}” will be archived and unavailable for new use.`;
  }
  return `“${course.title}” will return to draft and no longer be published.`;
}

export function CourseStatusSection({ course }: { course?: Course }) {
  const updateStatus = useUpdateCourseStatus();
  const [nextStatus, setNextStatus] = useState<CourseStatusTransition | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const currentStatus = course?.status ?? 'DRAFT';
  const allowedTransitions = course ? getAllowedCourseStatusTransitions(course.status) : [];

  const confirmStatusChange = async () => {
    if (!course || !nextStatus) return;
    const target = nextStatus;
    setStatusError(null);
    try {
      await updateStatus.mutateAsync({ id: course.id, status: target });
      setNextStatus(null);
      toast.success(`Course ${target === 'ACTIVE' ? 'published' : 'status updated'}`);
    } catch (error) {
      setNextStatus(null);
      setStatusError(getErrorMessage(error));
    }
  };

  return (
    <aside
      aria-labelledby="course-status-title"
      className="space-y-4 rounded-3xl bg-white p-5 shadow-md ring-1 ring-gray-200"
    >
      {statusError && <Alert className="mb-4">{statusError}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="course-status-title" className="text-sm font-semibold">
          Status
        </h2>
        <CourseStatusBadge status={currentStatus} />
      </div>
      <ul className="space-y-3">
        {COURSE_STATUSES.map((status) => (
          <li key={status} className="flex items-start gap-2.5 text-xs text-gray-600">
            <CourseStatusBadge status={status} />
            <span className="pt-0.5">{courseStatuses[status].description}</span>
          </li>
        ))}
      </ul>
      {allowedTransitions.length > 0 ? (
        <div className="space-y-2 border-t border-gray-200 pt-4">
          <h3 className="text-xs font-semibold">Change status</h3>
          {allowedTransitions.map((status) => {
            const Icon = statusIcon[status];
            if (!Icon) return null;
            return (
              <Button
                key={status}
                type="button"
                variant="secondary"
                className="w-full justify-center rounded-full"
                disabled={updateStatus.isPending}
                onClick={() => {
                  setStatusError(null);
                  setNextStatus(status);
                }}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {status === 'ACTIVE' && currentStatus === 'ARCHIVED'
                  ? 'Publish again'
                  : actionLabel[status]}
              </Button>
            );
          })}
          <p className="text-[11px] text-gray-600">
            {currentStatus === 'ARCHIVED'
              ? 'Archived courses may be published again.'
              : 'Draft courses can be published or archived. Published courses can be archived.'}
          </p>
        </div>
      ) : course ? (
        <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
          No status changes are available.
        </p>
      ) : (
        <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
          Courses are created as drafts. Publish when the course is ready.
        </p>
      )}
      <ConfirmDialog
        open={nextStatus !== null}
        title={`${nextStatus ? actionLabel[nextStatus] : 'Change'} course status?`}
        description={nextStatus && course ? confirmationDescription(course, nextStatus) : ''}
        confirmLabel={nextStatus ? actionLabel[nextStatus] : 'Confirm'}
        pending={updateStatus.isPending}
        pendingLabel="Updating…"
        onConfirm={() => {
          void confirmStatusChange();
        }}
        onCancel={() => {
          if (!updateStatus.isPending) setNextStatus(null);
        }}
      />
    </aside>
  );
}
