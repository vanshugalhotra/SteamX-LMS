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

  /** Loads active modules and their active lessons in course position order. */
  findActiveOutline(courseId: string) {
    return this.prisma.module.findMany({
      where: { courseId, status: ContentStatus.ACTIVE },
      orderBy: { position: 'asc' },
      select: RELEASE_OUTLINE_SELECT,
    });
  }

  /** Loads release timestamps for outline lessons in one query. */
  findMany(deliveryId: string, lessonIds: string[]) {
    return this.prisma.deliveryLessonRelease.findMany({
      where: { deliveryId, lessonId: { in: lessonIds } },
      select: { lessonId: true, releasedAt: true },
    });
  }

  /** Finds a lesson only when it belongs to the delivery's course. */
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

  /** Finds a module and all lesson eligibility fields under the delivery course. */
  findModule(courseId: string, moduleId: string) {
    return this.prisma.module.findFirst({
      where: { id: moduleId, courseId },
      select: RELEASE_MODULE_SELECT,
    });
  }

  /**
   * Ensures the lesson is released for the delivery and returns its stored timestamp.
   * @returns The existing or newly created release timestamp and whether this call created it.
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

  /** Deletes an existing release row without touching lesson completions. */
  deleteRelease(deliveryId: string, lessonId: string): Promise<{ count: number }> {
    return this.prisma.deliveryLessonRelease.deleteMany({ where: { deliveryId, lessonId } });
  }

  /** Inserts all eligible module releases in one transaction, skipping existing rows. */
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
