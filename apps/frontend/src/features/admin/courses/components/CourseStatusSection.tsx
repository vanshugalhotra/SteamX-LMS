import { useState } from 'react';
import { Archive, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CourseStatusBadge } from '@/components/ui/CourseStatusBadge';
import { getErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import type { Course } from '../model/types';
import {
  getAllowedCourseStatusTransitions,
  getCourseStatusActionLabel,
  getCourseStatusConfirmationDescription,
  getCourseStatusConfirmationTitle,
  type CourseStatusTransition,
} from '../model/status-transitions';
import { useUpdateCourseStatus } from '../queries';
import { COURSE_STATUSES, courseStatuses } from '../config/courses.config';

const statusIcon: Record<CourseStatusTransition, typeof Check> = {
  ACTIVE: Check,
  ARCHIVED: Archive,
};

export function CourseStatusSection({
  course,
  compact = false,
}: {
  course?: Pick<Course, 'id' | 'title' | 'status'>;
  compact?: boolean;
}) {
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
      toast.success(`Course ${target === 'ACTIVE' ? 'published' : 'archived'}`);
    } catch (error) {
      setNextStatus(null);
      setStatusError(getErrorMessage(error));
    }
  };

  const actionButtons = allowedTransitions.map((status) => {
    const Icon = statusIcon[status];
    return (
      <Button
        key={status}
        type="button"
        variant="secondary"
        className={cn(
          'rounded-full',
          compact
            ? 'border border-white bg-white text-brand-navy hover:bg-gray-100'
            : 'w-full justify-center',
        )}
        disabled={updateStatus.isPending}
        onClick={() => {
          setStatusError(null);
          setNextStatus(status);
        }}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {getCourseStatusActionLabel(status, currentStatus)}
      </Button>
    );
  });

  const Container = compact ? 'div' : 'aside';

  return (
    <Container
      {...(compact
        ? { role: 'group', 'aria-label': 'Course status actions' }
        : { 'aria-labelledby': 'course-status-title' })}
      className={cn(
        compact
          ? 'flex flex-wrap items-center justify-end gap-2'
          : 'space-y-4 rounded-3xl bg-white p-5 shadow-md ring-1 ring-gray-200',
      )}
    >
      {statusError && (
        <Alert className={cn(compact ? 'mb-0 basis-full' : 'mb-4')}>{statusError}</Alert>
      )}
      {!compact && (
        <>
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
        </>
      )}
      {allowedTransitions.length > 0 ? (
        <div
          className={cn(
            compact
              ? 'flex flex-wrap items-center gap-2'
              : 'space-y-2 border-t border-gray-200 pt-4',
          )}
        >
          {!compact && <h3 className="text-xs font-semibold">Change status</h3>}
          {actionButtons}
          {!compact && (
            <p className="text-[11px] text-gray-600">
              {currentStatus === 'ARCHIVED'
                ? 'Archived courses may be published again.'
                : 'Draft courses can be published or archived. Published courses can be archived.'}
            </p>
          )}
        </div>
      ) : !compact ? (
        course ? (
          <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
            No status changes are available.
          </p>
        ) : (
          <p className="border-t border-gray-200 pt-4 text-xs text-gray-600">
            Courses are created as drafts. Publish when the course is ready.
          </p>
        )
      ) : null}
      <ConfirmDialog
        open={nextStatus !== null}
        title={
          nextStatus
            ? getCourseStatusConfirmationTitle(nextStatus, currentStatus)
            : 'Change course status?'
        }
        description={
          nextStatus && course
            ? getCourseStatusConfirmationDescription(course.title, nextStatus)
            : ''
        }
        confirmLabel={
          nextStatus ? getCourseStatusActionLabel(nextStatus, currentStatus) : 'Confirm'
        }
        pending={updateStatus.isPending}
        pendingLabel="Updating…"
        onConfirm={() => {
          void confirmStatusChange();
        }}
        onCancel={() => {
          if (!updateStatus.isPending) setNextStatus(null);
        }}
      />
    </Container>
  );
}
