import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserType } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
} from '../common/errors/prisma-error.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import { CourseAccessService } from '../subscriptions/course-access.service.js';
import { LessonContentService } from '../curriculum/lesson-content/lesson-content.service.js';
import { LearningAccessService } from './learning-access.service.js';
import type { LearningCourseResponseDto } from './dto/learning-course-response.dto.js';
import type { LearningLessonContentResponseDto } from './dto/learning-lesson-content-response.dto.js';
import type { LearningOutlineResponseDto } from './dto/learning-outline-response.dto.js';
import type { LearningLessonCompletionResponseDto } from './dto/learning-lesson-completion-response.dto.js';
import type { LearningProgressResponseDto } from './dto/learning-progress-response.dto.js';
import {
  toLearningCourseResponse,
  toLearningAssetAccess,
  toLearningLessonCompletion,
  toLearningLessonContent,
  toLearningOutline,
  toLearningProgress,
} from './learning.mapper.js';
import { LearningAccessRepository } from './learning-access.repository.js';
import type { LearningLessonCompletionRecord } from './learning-access.repository.js';
import { AssetAccessService } from '../assets/asset-access.service.js';
import type { LearningAssetAccessResponseDto } from './dto/learning-asset-access-response.dto.js';

/** Provides learning navigation and access-checked student/teacher lesson content. */
@Injectable()
export class LearningService {
  constructor(
    private readonly learning: LearningAccessRepository,
    private readonly access: LearningAccessService,
    private readonly courseAccess: CourseAccessService,
    private readonly lessonContent: LessonContentService,
    private readonly assetAccess: AssetAccessService,
  ) {}

  /** Lists the student's active enrollments with page-level progress and subscription state. */
  async findStudentCourses(
    auth: AuthContext,
    query: PaginationQueryDto,
  ): Promise<PaginationResponseDto<LearningCourseResponseDto>> {
    const schoolId = this.getStudentSchoolId(auth);
    const { items, total } = await this.learning.findStudentCourses(auth.userId, schoolId, query);
    const deliveryIds = items.map(({ deliveryId }) => deliveryId);
    const [{ totals, completions }, activity] = await Promise.all([
      this.learning.findStudentCourseLessonCounts(deliveryIds, auth.userId),
      this.courseAccess.getSubscriptionActivity(
        items.map(({ delivery }) => ({ schoolId, courseId: delivery.course.id })),
      ),
    ]);

    const totalsByDelivery = new Map(totals.map(({ deliveryId, count }) => [deliveryId, count]));
    const completionsByDelivery = new Map(
      completions.map(({ deliveryId, count }) => [deliveryId, count]),
    );
    const subscriptionByCourse = new Map(
      activity.map(({ courseId, active }) => [courseId, active]),
    );

    return paginate(
      items.map((enrollment) => {
        const subscriptionActive = subscriptionByCourse.get(enrollment.delivery.course.id);
        if (subscriptionActive === undefined) {
          throw new Error('Expected subscription activity for every course in the page.');
        }
        return toLearningCourseResponse(
          enrollment,
          totalsByDelivery.get(enrollment.deliveryId) ?? 0,
          completionsByDelivery.get(enrollment.deliveryId) ?? 0,
          subscriptionActive,
        );
      }),
      query.page,
      query.limit,
      total,
    );
  }

  /** Returns released student lessons after the shared delivery/subscription access check. */
  async getStudentOutline(
    auth: AuthContext,
    deliveryId: string,
  ): Promise<LearningOutlineResponseDto> {
    const schoolId = this.getStudentSchoolId(auth);
    const access = await this.access.assertDeliveryAccess(auth, deliveryId);
    const rows = await this.learning.findStudentOutline(
      access.deliveryId,
      schoolId,
      access.courseId,
      auth.userId,
    );
    if (rows.length === 0) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toLearningOutline(rows);
  }

  /** Records a student's completion after checking the released lesson and subscription. */
  async completeStudentLesson(
    auth: AuthContext,
    deliveryId: string,
    lessonId: string,
  ): Promise<LearningLessonCompletionResponseDto> {
    const access = await this.access.assertLessonAccess(auth, deliveryId, lessonId);
    if (access.studentId === undefined || access.lesson === undefined) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }

    let completion: LearningLessonCompletionRecord | null;
    try {
      completion = await this.learning.completeStudentLesson({
        schoolId: access.schoolId,
        deliveryId: access.deliveryId,
        studentId: access.studentId,
        lessonId: access.lesson.id,
        courseId: access.courseId,
      });
    } catch (error) {
      const reason = getPrismaReason(error).toLowerCase();
      if (
        isPrismaKnownError(error) &&
        (error.code === 'P2004' || getPostgresCode(error) === '23000') &&
        reason.includes('lesson_completions require')
      ) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      throw error;
    }
    if (!completion) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toLearningLessonCompletion(completion);
  }

  /** Returns released lesson totals and this student's completions grouped by module. */
  async getStudentProgress(
    auth: AuthContext,
    deliveryId: string,
  ): Promise<LearningProgressResponseDto> {
    const access = await this.access.assertDeliveryAccess(auth, deliveryId);
    if (access.studentId === undefined) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }
    const modules = await this.learning.findStudentProgress(
      access.deliveryId,
      access.courseId,
      access.studentId,
    );
    return toLearningProgress(access.deliveryId, modules);
  }

  /** Returns a lesson tree only after the shared delivery and lesson access check succeeds. */
  async getLessonContent(
    auth: AuthContext,
    deliveryId: string,
    lessonId: string,
  ): Promise<LearningLessonContentResponseDto> {
    const result = await this.access.assertLessonAccess(auth, deliveryId, lessonId);
    if (!result.lesson) {
      throw new Error('Expected lesson access details for a lesson content read.');
    }
    const tree = await this.lessonContent.findTreeByLessonId(result.lesson.id);
    return toLearningLessonContent(result.lesson.id, tree);
  }

  /** Issues a short-lived URL only for a READY asset referenced by an accessible lesson. */
  async getLessonAssetAccess(
    auth: AuthContext,
    deliveryId: string,
    lessonId: string,
    assetId: string,
  ): Promise<LearningAssetAccessResponseDto> {
    const access = await this.access.assertLessonAccess(auth, deliveryId, lessonId);
    const asset = await this.learning.findServableAsset(lessonId, assetId);
    if (!asset) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const school = await this.learning.findSchoolNameById(access.schoolId);
    if (!school) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    const issuedAt = new Date();
    const signedAccess = await this.assetAccess.issueForFile(asset.file, asset.type);
    return toLearningAssetAccess(signedAccess, {
      name: auth.name,
      steamxId: auth.steamxId,
      schoolName: school.name,
      issuedAt: issuedAt.toISOString(),
    });
  }

  private getStudentSchoolId(auth: AuthContext): string {
    if (auth.userType !== UserType.STUDENT) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }
    const schoolId = resolveSchoolScope(auth);
    if (schoolId === undefined) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }
    return schoolId;
  }
}
