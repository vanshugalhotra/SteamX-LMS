import { ContentStatus, LessonAudience } from '../../generated/prisma/client.js';

type ReleaseEligibility = {
  status: ContentStatus;
  audience: LessonAudience;
};

/** Returns the reason a lesson cannot be released, or undefined when it is eligible. */
export function getLessonReleaseIneligibilityReason(
  lesson: ReleaseEligibility,
  moduleStatus: ContentStatus,
): string | undefined {
  if (moduleStatus !== ContentStatus.ACTIVE) {
    return 'MODULE_NOT_ACTIVE';
  }
  if (lesson.status !== ContentStatus.ACTIVE) {
    return `LESSON_${lesson.status}`;
  }
  if (lesson.audience !== LessonAudience.STUDENT) {
    return 'TEACHER_ONLY';
  }
  return undefined;
}
