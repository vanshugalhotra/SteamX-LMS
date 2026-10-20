import type { Course } from '../../generated/prisma/client.js';
import type { CourseResponseDto } from './dto/course-response.dto.js';

export function toCourseResponse(course: Course): CourseResponseDto {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    status: course.status,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}
