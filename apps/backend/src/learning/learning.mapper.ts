import type { LearningCourseResponseDto } from './dto/learning-course-response.dto.js';
import type {
  LearningOutlineModuleDto,
  LearningOutlineResponseDto,
} from './dto/learning-outline-response.dto.js';
import type { LearningOutlineRecord, StudentCourseRecord } from './learning-access.repository.js';

/** Maps one enrollment and its aggregated state to the student course-list response. */
export function toLearningCourseResponse(
  enrollment: StudentCourseRecord,
  totalLessons: number,
  completedLessons: number,
  subscriptionActive: boolean,
): LearningCourseResponseDto {
  return {
    deliveryId: enrollment.deliveryId,
    course: enrollment.delivery.course,
    className: enrollment.delivery.classSection.className,
    sectionName: enrollment.delivery.classSection.sectionName,
    academicYear: enrollment.delivery.academicYear,
    totalLessons,
    completedLessons,
    subscriptionActive,
  };
}

/** Builds the student outline tree from ordered rows, omitting modules without eligible lessons. */
export function toLearningOutline(rows: LearningOutlineRecord[]): LearningOutlineResponseDto {
  const first = rows[0];
  if (!first) {
    throw new Error('Expected an outline query row for an accessible delivery.');
  }

  const modules = new Map<string, LearningOutlineModuleDto>();
  for (const row of rows) {
    if (row.lessonId === null || row.lessonTitle === null || row.lessonPosition === null) {
      continue;
    }
    if (row.moduleId === null || row.moduleTitle === null || row.modulePosition === null) {
      continue;
    }

    let module = modules.get(row.moduleId);
    if (!module) {
      module = {
        id: row.moduleId,
        title: row.moduleTitle,
        position: row.modulePosition,
        lessons: [],
      };
      modules.set(row.moduleId, module);
    }
    module.lessons.push({
      id: row.lessonId,
      title: row.lessonTitle,
      position: row.lessonPosition,
      completed: row.completed,
    });
  }

  return {
    deliveryId: first.deliveryId,
    course: { id: first.courseId, title: first.courseTitle },
    modules: [...modules.values()],
  };
}
