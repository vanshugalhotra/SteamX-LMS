import type { LearningCourseResponseDto } from './dto/learning-course-response.dto.js';
import type { LearningLessonCompletionResponseDto } from './dto/learning-lesson-completion-response.dto.js';
import type {
  LearningProgressModuleDto,
  LearningProgressResponseDto,
} from './dto/learning-progress-response.dto.js';
import type { LearningAssetAccessResponseDto } from './dto/learning-asset-access-response.dto.js';
import type { LearningLessonContentResponseDto } from './dto/learning-lesson-content-response.dto.js';
import type {
  LearningOutlineModuleDto,
  LearningOutlineResponseDto,
} from './dto/learning-outline-response.dto.js';
import type {
  LearningLessonCompletionRecord,
  LearningOutlineRecord,
  LearningProgressModuleRecord,
  StudentCourseRecord,
} from './learning-access.repository.js';
import type { LessonContentTree } from '../curriculum/lesson-content/lesson-content.types.js';
import type { AssetAccessResponseDto } from '../assets/dto/asset-access-response.dto.js';

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
    label: enrollment.delivery.label,
    academicYear: enrollment.delivery.academicYear,
    totalLessons,
    completedLessons,
    subscriptionActive,
  };
}

/** Maps the persisted completion to the stable lesson completion response. */
export function toLearningLessonCompletion(
  completion: LearningLessonCompletionRecord,
): LearningLessonCompletionResponseDto {
  return {
    lessonId: completion.lessonId,
    completed: true,
    completedAt: completion.completedAt.toISOString(),
  };
}

/** Maps grouped module progress to an aggregate delivery response. */
export function toLearningProgress(
  deliveryId: string,
  modules: LearningProgressModuleRecord[],
): LearningProgressResponseDto {
  const mappedModules: LearningProgressModuleDto[] = modules.map((module) => ({
    moduleId: module.moduleId,
    title: module.title,
    position: module.position,
    totalLessons: module.totalLessons,
    completedLessons: module.completedLessons,
  }));
  return {
    deliveryId,
    totalLessons: mappedModules.reduce((total, module) => total + module.totalLessons, 0),
    completedLessons: mappedModules.reduce((total, module) => total + module.completedLessons, 0),
    modules: mappedModules,
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

/** Maps shared lesson content to the minimal student/teacher read response. */
export function toLearningLessonContent(
  lessonId: string,
  tree: LessonContentTree,
): LearningLessonContentResponseDto {
  return {
    lessonId,
    title: tree.title,
    blocks: tree.blocks,
    assets: [...tree.assets.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, type, title, file }) => ({
        id,
        type,
        title,
        mimeType: file?.mimeType ?? null,
      })),
  };
}

/** Maps a signed asset URL and trusted identity fields to the learning response. */
export function toLearningAssetAccess(
  access: AssetAccessResponseDto,
  viewer: LearningAssetAccessResponseDto['viewer'],
): LearningAssetAccessResponseDto {
  return {
    url: access.url,
    expiresAt: access.expiresAt.toISOString(),
    type: access.type,
    mimeType: access.mimeType,
    viewer,
  };
}
