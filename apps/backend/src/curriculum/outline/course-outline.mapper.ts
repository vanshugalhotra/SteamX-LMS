import type {
  CourseOutlineLessonDto,
  CourseOutlineModuleDto,
  CourseOutlineResponseDto,
} from './dto/course-outline-response.dto.js';
import type { CourseOutlineRecord } from './course-outline.repository.js';

export function toCourseOutlineResponse(course: CourseOutlineRecord): CourseOutlineResponseDto {
  return {
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
    },
    modules: course.modules.map((module): CourseOutlineModuleDto => ({
      id: module.id,
      title: module.title,
      position: module.position,
      status: module.status,
      lessons: module.lessons.map((lesson): CourseOutlineLessonDto => ({
        id: lesson.id,
        title: lesson.title,
        position: lesson.position,
        status: lesson.status,
        audience: lesson.audience,
      })),
    })),
  };
}
