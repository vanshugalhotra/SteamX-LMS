import type { Module as CourseModuleRecord } from '../../generated/prisma/client.js';
import type { CourseModuleResponseDto } from './dto/course-module-response.dto.js';

export function toCourseModuleResponse(module: CourseModuleRecord): CourseModuleResponseDto {
  return {
    id: module.id,
    courseId: module.courseId,
    title: module.title,
    position: module.position,
    status: module.status,
    createdAt: module.createdAt,
    updatedAt: module.updatedAt,
  };
}
