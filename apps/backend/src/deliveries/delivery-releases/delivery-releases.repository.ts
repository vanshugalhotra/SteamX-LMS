import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const RELEASE_OUTLINE_SELECT = {
  id: true,
  title: true,
  position: true,
  status: true,
  lessons: {
    where: { status: ContentStatus.ACTIVE },
    orderBy: { position: 'asc' },
    select: { id: true, title: true, position: true, status: true, audience: true },
  },
} satisfies Prisma.ModuleSelect;

const RELEASE_MODULE_SELECT = {
  id: true,
  status: true,
  lessons: { select: { id: true, status: true, audience: true } },
} satisfies Prisma.ModuleSelect;

/** Stores release outline reads and delivery lesson release writes. */
@Injectable()
export class DeliveryReleasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads active modules and active lessons in course position order.
   * @param courseId Course whose outline is requested.
   * @returns Modules and selected lesson release-eligibility fields.
   */
  findActiveOutline(courseId: string) {
    return this.prisma.module.findMany({
      where: { courseId, status: ContentStatus.ACTIVE },
      orderBy: { position: 'asc' },
      select: RELEASE_OUTLINE_SELECT,
    });
  }

  /**
   * Loads existing release timestamps for the requested lessons in a delivery.
   * @param deliveryId Delivery whose releases are read.
   * @param lessonIds Lesson IDs in the active course outline.
   * @returns Existing lesson IDs and their original release timestamps.
   */
  findMany(deliveryId: string, lessonIds: string[]) {
    return this.prisma.deliveryLessonRelease.findMany({
      where: { deliveryId, lessonId: { in: lessonIds } },
      select: { lessonId: true, releasedAt: true },
    });
  }

  /**
   * Finds lesson release-eligibility fields only within the delivery's course.
   * @param courseId Course that owns the delivery.
   * @param lessonId Lesson being checked.
   * @returns The lesson and parent-module statuses, or null when it is outside the course.
   */
  findLesson(courseId: string, lessonId: string) {
    return this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: {
        status: true,
        audience: true,
        module: { select: { status: true } },
      },
    });
  }

  /**
   * Finds a module and its lesson eligibility fields within the delivery's course.
   * @param courseId Course that owns the delivery.
   * @param moduleId Module being checked.
   * @returns The module and lesson fields, or null when it is outside the course.
   */
  findModule(courseId: string, moduleId: string) {
    return this.prisma.module.findFirst({
      where: { id: moduleId, courseId },
      select: RELEASE_MODULE_SELECT,
    });
  }

  /**
   * Inserts one release idempotently and reads back its persisted timestamp in the same transaction.
   * @param data Release owner IDs and the actor recording the release.
   * @returns The original or new release timestamp and insert count (zero or one).
   */
  async createRelease(data: {
    deliveryId: string;
    lessonId: string;
    schoolId: string;
    courseId: string;
    releasedById: string;
  }): Promise<{ releasedAt: Date; newlyReleased: number }> {
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.deliveryLessonRelease.createMany({
        data: [data],
        skipDuplicates: true,
      });
      const release = await tx.deliveryLessonRelease.findUnique({
        where: {
          deliveryId_lessonId: { deliveryId: data.deliveryId, lessonId: data.lessonId },
        },
        select: { releasedAt: true },
      });
      if (!release) {
        throw new Error('Expected delivery lesson release to exist after insert.');
      }
      return { releasedAt: release.releasedAt, newlyReleased: inserted.count };
    });
  }

  /**
   * Deletes a release row without changing lesson completions.
   * @param deliveryId Delivery whose release is removed.
   * @param lessonId Lesson whose release is removed.
   * @returns Number of deleted rows; zero when no release existed.
   */
  deleteRelease(deliveryId: string, lessonId: string): Promise<{ count: number }> {
    return this.prisma.deliveryLessonRelease.deleteMany({ where: { deliveryId, lessonId } });
  }

  /**
   * Inserts eligible lesson releases atomically and skips rows already released.
   * @param data Delivery, school, course, actor, and eligible lesson IDs.
   * @returns Number of release rows inserted; zero for an empty list.
   */
  async createManyReleases(data: {
    deliveryId: string;
    schoolId: string;
    courseId: string;
    releasedById: string;
    lessonIds: string[];
  }): Promise<number> {
    if (data.lessonIds.length === 0) {
      return 0;
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.deliveryLessonRelease.createMany({
        data: data.lessonIds.map((lessonId) => ({
          deliveryId: data.deliveryId,
          lessonId,
          schoolId: data.schoolId,
          courseId: data.courseId,
          releasedById: data.releasedById,
        })),
        skipDuplicates: true,
      });
      return result.count;
    });
  }
}
