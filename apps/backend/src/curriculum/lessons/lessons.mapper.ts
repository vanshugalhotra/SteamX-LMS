import type { Lesson } from '../../generated/prisma/client.js';
import type { LessonResponseDto } from './dto/lesson-response.dto.js';

export function toLessonResponse(lesson: Lesson): LessonResponseDto {
  return {
    id: lesson.id,
    moduleId: lesson.moduleId,
    courseId: lesson.courseId,
    title: lesson.title,
    position: lesson.position,
    status: lesson.status,
    audience: lesson.audience,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}
