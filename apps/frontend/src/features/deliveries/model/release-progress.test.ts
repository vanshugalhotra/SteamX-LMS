import { describe, expect, it } from 'vitest';
import { getStudentLessonReleaseProgress } from './release-progress';
import type { ReleaseOutlineResponse } from './types';

describe('getStudentLessonReleaseProgress', () => {
  it('counts only releasable student lessons and preserves their release state', () => {
    const outline: ReleaseOutlineResponse = {
      modules: [
        {
          id: 'module-1',
          title: 'Module 1',
          position: 1,
          releaseState: 'PARTIAL',
          releasedCount: 2,
          releasableLessonCount: 2,
          lessons: [
            {
              id: 'student-released',
              title: 'Released student lesson',
              position: 1,
              audience: 'STUDENT',
              released: true,
              releasedAt: '2026-11-18T12:00:00.000Z',
              releasable: true,
            },
            {
              id: 'student-unreleased',
              title: 'Unreleased student lesson',
              position: 2,
              audience: 'STUDENT',
              released: false,
              releasedAt: null,
              releasable: true,
            },
            {
              id: 'teacher-only',
              title: 'Teacher-only lesson',
              position: 3,
              audience: 'TEACHER_ONLY',
              released: true,
              releasedAt: '2026-11-18T12:00:00.000Z',
              releasable: false,
            },
            {
              id: 'inactive-student',
              title: 'Inactive student lesson',
              position: 4,
              audience: 'STUDENT',
              released: false,
              releasedAt: null,
              releasable: false,
            },
          ],
        },
      ],
    };

    expect(getStudentLessonReleaseProgress(outline)).toEqual({ released: 1, total: 2 });
  });
});
