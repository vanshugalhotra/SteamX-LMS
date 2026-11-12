import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentStatus,
  DeliveryStatus,
  LessonAudience,
  UserType,
} from '../generated/prisma/client.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import { DeliveryAccessService } from '../deliveries/delivery-access.service.js';
import { CourseAccessService } from '../subscriptions/course-access.service.js';
import { LearningAccessRepository } from './learning-access.repository.js';

const LEARNING_ROLE = {
  STUDENT: 'STUDENT',
  TEACHER: 'TEACHER',
} as const;

type LearningRole = (typeof LEARNING_ROLE)[keyof typeof LEARNING_ROLE];

/** Trusted access data for a delivery or lesson learning read. */
export type LearningAccessResult = {
  role: LearningRole;
  schoolId: string;
  deliveryId: string;
  courseId: string;
  studentId?: string;
  lesson?: {
    id: string;
    moduleId: string;
    status: ContentStatus;
    audience: LessonAudience;
  };
};

/** Applies shared student and teacher access rules to learning reads. */
@Injectable()
export class LearningAccessService {
  constructor(
    private readonly learning: LearningAccessRepository,
    private readonly courseAccess: CourseAccessService,
    private readonly deliveryAccess: DeliveryAccessService,
  ) {}

  /** Checks whether the authenticated student or teacher can read this delivery. */
  assertDeliveryAccess(auth: AuthContext, deliveryId: string): Promise<LearningAccessResult> {
    return this.assertAccess(auth, deliveryId);
  }

  /** Checks delivery visibility and whether the authenticated user can read this lesson. */
  assertLessonAccess(
    auth: AuthContext,
    deliveryId: string,
    lessonId: string,
  ): Promise<LearningAccessResult> {
    return this.assertAccess(auth, deliveryId, lessonId);
  }

  private async assertAccess(
    auth: AuthContext,
    deliveryId: string,
    lessonId?: string,
  ): Promise<LearningAccessResult> {
    const role = this.getRole(auth);
    const schoolId = resolveSchoolScope(auth);
    if (schoolId === undefined) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    let delivery;
    // Students require an active enrollment; teachers require an active assignment via DeliveryAccessService.
    if (role === LEARNING_ROLE.STUDENT) {
      delivery = await this.learning.findStudentDelivery(deliveryId, schoolId, auth.userId);
    } else {
      delivery = await this.deliveryAccess.load(auth, deliveryId);
    }

    if (!delivery || delivery.status !== DeliveryStatus.ACTIVE) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    let lesson: LearningAccessResult['lesson'];
    if (lessonId !== undefined) {
      // Released student lessons were ACTIVE and database triggers prevent DRAFT parents.
      const lessonRecord = await this.learning.findLesson(
        deliveryId,
        delivery.courseId,
        lessonId,
        role,
      );
      if (!lessonRecord) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      lesson = lessonRecord;
    }

    await this.courseAccess.assertSubscriptionActive(schoolId, delivery.courseId);

    const result: LearningAccessResult = {
      role,
      schoolId,
      deliveryId: delivery.id,
      courseId: delivery.courseId,
    };
    if (role === LEARNING_ROLE.STUDENT) {
      result.studentId = auth.userId;
    }
    if (lesson !== undefined) {
      result.lesson = lesson;
    }
    return result;
  }

  private getRole(auth: AuthContext): LearningRole {
    if (auth.userType === UserType.STUDENT) {
      return LEARNING_ROLE.STUDENT;
    }
    if (auth.userType === UserType.SCHOOL_STAFF) {
      return LEARNING_ROLE.TEACHER;
    }
    throw new ForbiddenException(API_ERROR.FORBIDDEN);
  }
}
