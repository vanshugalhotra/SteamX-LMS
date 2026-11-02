import type { ContentStatus } from '@/lib/content-status';

export type CourseStatusTransition = Exclude<ContentStatus, 'DRAFT'>;

const COURSE_STATUS_TRANSITIONS: Record<ContentStatus, readonly CourseStatusTransition[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

export function getAllowedCourseStatusTransitions(status: ContentStatus): CourseStatusTransition[] {
  return [...COURSE_STATUS_TRANSITIONS[status]];
}
