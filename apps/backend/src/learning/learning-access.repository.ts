import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  LessonAudience,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const LEARNING_DELIVERY_SELECT = {
  id: true,
  schoolId: true,
  courseId: true,
  status: true,
} satisfies Prisma.DeliverySelect;

const LEARNING_LESSON_SELECT = {
  id: true,
  moduleId: true,
  status: true,
  audience: true,
} satisfies Prisma.LessonSelect;

/** Queries delivery and lesson visibility for student and teacher learning reads. */
@Injectable()
export class LearningAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads an active delivery only when the student has an active enrollment in it. */
  findStudentDelivery(deliveryId: string, schoolId: string, studentId: string) {
    return this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        schoolId,
        status: DeliveryStatus.ACTIVE,
        enrollments: {
          some: { studentId, status: EnrollmentStatus.ACTIVE },
        },
      },
      select: LEARNING_DELIVERY_SELECT,
    });
  }

  /** Loads a readable active or archived lesson with student-only release and audience filters. */
  findLesson(
    deliveryId: string,
    courseId: string,
    lessonId: string,
    role: 'STUDENT' | 'TEACHER',
  ) {
    const where: Prisma.LessonWhereInput = {
      id: lessonId,
      courseId,
      status: { in: [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] },
    };
    if (role === 'STUDENT') {
      where.audience = LessonAudience.STUDENT;
      where.releases = { some: { deliveryId } };
    }

    return this.prisma.lesson.findFirst({
      where,
      select: LEARNING_LESSON_SELECT,
    });
  }
}
