import type { ReleaseOutlineResponse } from './types';

export function getStudentLessonReleaseProgress(outline: ReleaseOutlineResponse) {
  const studentLessons = outline.modules
    .flatMap((module) => module.lessons)
    .filter((lesson) => lesson.audience === 'STUDENT' && lesson.releasable);

  return {
    released: studentLessons.filter((lesson) => lesson.released).length,
    total: studentLessons.length,
  };
}
