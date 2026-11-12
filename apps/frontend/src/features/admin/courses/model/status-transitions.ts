import type { ContentStatus } from '@/lib/content-status';

export type CourseStatusTransition = Exclude<ContentStatus, 'DRAFT'>;

const COURSE_STATUS_ACTION_LABELS: Record<CourseStatusTransition, string> = {
  ACTIVE: 'Publish',
  ARCHIVED: 'Archive',
};

const COURSE_STATUS_TRANSITIONS: Record<ContentStatus, readonly CourseStatusTransition[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export function getCourseStatusActionLabel(
  status: CourseStatusTransition,
  currentStatus: ContentStatus,
): string {
  return status === 'ACTIVE' && currentStatus === 'ARCHIVED'
    ? 'Publish again'
    : COURSE_STATUS_ACTION_LABELS[status];
}

export function getCourseStatusConfirmationTitle(
  status: CourseStatusTransition,
  currentStatus: ContentStatus,
): string {
  return status === 'ACTIVE' && currentStatus === 'ARCHIVED'
    ? 'Publish course again?'
    : `${COURSE_STATUS_ACTION_LABELS[status]} course?`;
}

export function getCourseStatusConfirmationDescription(
  courseTitle: string,
  status: CourseStatusTransition,
): string {
  return status === 'ACTIVE'
    ? `“${courseTitle}” will be published and made available for use.`
    : `“${courseTitle}” will be archived and unavailable for new use.`;
}

export function getAllowedCourseStatusTransitions(status: ContentStatus): CourseStatusTransition[] {
  return [...COURSE_STATUS_TRANSITIONS[status]];
}
