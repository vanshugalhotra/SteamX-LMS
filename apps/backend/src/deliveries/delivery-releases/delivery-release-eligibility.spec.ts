import { ContentStatus, LessonAudience } from '../../generated/prisma/client.js';
import { getLessonReleaseIneligibilityReason } from './delivery-release-eligibility.js';

describe('getLessonReleaseIneligibilityReason', () => {
  it('accepts only active student lessons in active modules', () => {
    expect(
      getLessonReleaseIneligibilityReason(
        { status: ContentStatus.ACTIVE, audience: LessonAudience.STUDENT },
        ContentStatus.ACTIVE,
      ),
    ).toBeUndefined();
    expect(
      getLessonReleaseIneligibilityReason(
        { status: ContentStatus.ACTIVE, audience: LessonAudience.TEACHER_ONLY },
        ContentStatus.ACTIVE,
      ),
    ).toBe('TEACHER_ONLY');
    expect(
      getLessonReleaseIneligibilityReason(
        { status: ContentStatus.DRAFT, audience: LessonAudience.STUDENT },
        ContentStatus.ACTIVE,
      ),
    ).toBe('LESSON_DRAFT');
    expect(
      getLessonReleaseIneligibilityReason(
        { status: ContentStatus.ARCHIVED, audience: LessonAudience.STUDENT },
        ContentStatus.ACTIVE,
      ),
    ).toBe('LESSON_ARCHIVED');
    expect(
      getLessonReleaseIneligibilityReason(
        { status: ContentStatus.ACTIVE, audience: LessonAudience.STUDENT },
        ContentStatus.ARCHIVED,
      ),
    ).toBe('MODULE_NOT_ACTIVE');
  });
});
