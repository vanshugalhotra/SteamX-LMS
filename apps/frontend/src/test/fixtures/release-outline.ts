import type { ReleaseLesson, ReleaseOutlineResponse } from '@/features/deliveries/model/types';

export function createReleaseLesson(
  id: string,
  title: string,
  overrides: Partial<ReleaseLesson> = {},
): ReleaseLesson {
  return {
    id,
    title,
    position: 1,
    audience: 'STUDENT',
    released: false,
    releasedAt: null,
    releasable: true,
    ...overrides,
  };
}

export const releaseOutlineFixture: ReleaseOutlineResponse = {
  modules: [
    {
      id: 'module-1',
      title: 'Plants and Energy',
      position: 1,
      releaseState: 'PARTIAL',
      releasedCount: 1,
      releasableLessonCount: 2,
      lessons: [
        createReleaseLesson('released-lesson', 'How plants make food', {
          released: true,
          releasedAt: '2026-11-18T12:00:00.000Z',
        }),
        createReleaseLesson('unreleased-lesson', 'What plants need', { position: 2 }),
        {
          id: 'teacher-lesson',
          title: 'Teacher lab notes',
          position: 3,
          audience: 'TEACHER_ONLY',
          released: false,
          releasedAt: null,
          releasable: false,
        },
        createReleaseLesson('ineligible-released-lesson', 'Archived student lesson', {
          position: 4,
          released: true,
          releasedAt: '2026-11-18T12:00:00.000Z',
          releasable: false,
        }),
      ],
    },
  ],
};
