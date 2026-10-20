/** Runs global lesson queries and transactional position writes through Prisma. */
import { Injectable } from '@nestjs/common';
import { ContentStatus, LessonAudience, Prisma } from '../../generated/prisma/client.js';
import type { Lesson } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isValidLessonOrder } from './lesson-order.js';
import type { CreateLessonDto } from './dto/create-lesson.dto.js';
import type { UpdateLessonDto } from './dto/update-lesson.dto.js';

const PARK_OFFSET = 1_000_000;

type LessonWithModule = Prisma.LessonGetPayload<{
  include: { module: { select: { status: true } } };
}>;

export type ReorderLessonsResult =
  { kind: 'not-found' } | { kind: 'invalid-order' } | { kind: 'ok'; lessons: Lesson[] };

@Injectable()
export class LessonsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(moduleId: string, data: CreateLessonDto): Promise<Lesson | null> {
    return this.prisma.$transaction(async (tx) => {
      const module = await lockModule(tx, moduleId);
      if (!module) {
        return null;
      }

      const lastLesson = await tx.lesson.findFirst({
        where: { moduleId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      return tx.lesson.create({
        data: {
          moduleId,
          courseId: module.courseId,
          title: data.title,
          audience: data.audience ?? LessonAudience.TEACHER_ONLY,
          position: (lastLesson?.position ?? 0) + 1,
          status: ContentStatus.DRAFT,
        },
      });
    });
  }

  async findManyForModule(moduleId: string): Promise<Lesson[] | null> {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true },
    });
    if (!module) {
      return null;
    }
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });
  }

  reorder(moduleId: string, lessonIds: readonly string[]): Promise<ReorderLessonsResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockModule(tx, moduleId))) {
        return { kind: 'not-found' };
      }

      const currentLessons = await tx.lesson.findMany({
        where: { moduleId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const currentIds = currentLessons.map((lesson) => lesson.id);
      if (!isValidLessonOrder(lessonIds, currentIds)) {
        return { kind: 'invalid-order' };
      }

      await tx.lesson.updateMany({
        where: { moduleId },
        data: { position: { increment: PARK_OFFSET } },
      });
      for (const [index, id] of lessonIds.entries()) {
        await tx.lesson.update({
          where: { id },
          data: { position: index + 1 },
        });
      }
      return {
        kind: 'ok',
        lessons: await tx.lesson.findMany({
          where: { moduleId },
          orderBy: { position: 'asc' },
        }),
      };
    });
  }

  findById(id: string): Promise<LessonWithModule | null> {
    return this.prisma.lesson.findUnique({
      where: { id },
      include: { module: { select: { status: true } } },
    });
  }

  async update(id: string, data: UpdateLessonDto): Promise<LessonWithModule | null> {
    const result = await this.prisma.lesson.updateMany({ where: { id }, data });
    return result.count === 0 ? null : this.findById(id);
  }

  async updateStatus(
    id: string,
    currentStatus: ContentStatus,
    status: ContentStatus,
  ): Promise<LessonWithModule | null> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.lesson.updateMany({
        where: { id, status: currentStatus },
        data: { status },
      });
      return result.count === 0
        ? null
        : tx.lesson.findUnique({
            where: { id },
            include: { module: { select: { status: true } } },
          });
    });
  }

  delete(id: string): Promise<{ id: string; title: string }> {
    return this.prisma.lesson.delete({
      where: { id },
      select: { id: true, title: true },
    });
  }
}

async function lockModule(
  tx: Prisma.TransactionClient,
  moduleId: string,
): Promise<{ id: string; courseId: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; course_id: string }[]>`
    SELECT id, course_id FROM modules WHERE id = ${moduleId}::uuid FOR UPDATE
  `;
  const module = rows[0];
  return module ? { id: module.id, courseId: module.course_id } : null;
}
