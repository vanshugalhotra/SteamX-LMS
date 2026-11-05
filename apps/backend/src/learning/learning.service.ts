import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserType } from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { API_ERROR } from '../common/errors/api-errors.js';
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
import {
  toLearningCourseResponse,
  toLearningLessonContent,
  toLearningOutline,
} from './learning.mapper.js';
import { LearningAccessRepository } from './learning-access.repository.js';

/** Provides learning navigation and access-checked student/teacher lesson content. */
@Injectable()
export class LearningService {
  constructor(
    private readonly learning: LearningAccessRepository,
    private readonly access: LearningAccessService,
    private readonly courseAccess: CourseAccessService,
    private readonly lessonContent: LessonContentService,
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
