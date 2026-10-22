/** Runs global module queries and transactional position writes through Prisma. */
import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma } from '../../generated/prisma/client.js';
import type { Module as CourseModuleRecord } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isValidReorder, PARK_OFFSET } from '../reorder.js';
import type { CreateCourseModuleDto } from './dto/create-course-module.dto.js';
import type { UpdateCourseModuleDto } from './dto/update-course-module.dto.js';

type CourseModuleWithCourse = Prisma.ModuleGetPayload<{
  include: { course: { select: { status: true } } };
}>;

export type ReorderCourseModulesResult =
  { kind: 'not-found' } | { kind: 'invalid-order' } | { kind: 'ok'; modules: CourseModuleRecord[] };

@Injectable()
export class CourseModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(courseId: string, data: CreateCourseModuleDto): Promise<CourseModuleRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockCourse(tx, courseId))) {
        return null;
      }

      const lastModule = await tx.module.findFirst({
        where: { courseId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      return tx.module.create({
        data: {
          courseId,
          title: data.title,
          position: (lastModule?.position ?? 0) + 1,
          status: ContentStatus.DRAFT,
        },
      });
    });
  }

  async findManyForCourse(courseId: string): Promise<CourseModuleRecord[] | null> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) {
      return null;
    }
    return this.prisma.module.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
    });
  }

  reorder(courseId: string, moduleIds: readonly string[]): Promise<ReorderCourseModulesResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await lockCourse(tx, courseId))) {
        return { kind: 'not-found' };
      }

      const currentModules = await tx.module.findMany({
        where: { courseId },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      const currentIds = currentModules.map((module) => module.id);
      if (!isValidReorder(moduleIds, currentIds)) {
        return { kind: 'invalid-order' };
      }

      await tx.module.updateMany({
        where: { courseId },
        data: { position: { increment: PARK_OFFSET } },
      });
      for (const [index, id] of moduleIds.entries()) {
        await tx.module.update({
          where: { id },
          data: { position: index + 1 },
        });
      }

      return {
        kind: 'ok',
        modules: await tx.module.findMany({
          where: { courseId },
          orderBy: { position: 'asc' },
        }),
      };
    });
  }

  findById(id: string): Promise<CourseModuleWithCourse | null> {
    return this.prisma.module.findUnique({
      where: { id },
      include: { course: { select: { status: true } } },
    });
  }

  async update(id: string, data: UpdateCourseModuleDto): Promise<CourseModuleWithCourse | null> {
    const result = await this.prisma.module.updateMany({ where: { id }, data });
    return result.count === 0 ? null : this.findById(id);
  }

  async updateStatus(
    id: string,
    currentStatus: ContentStatus,
    status: ContentStatus,
  ): Promise<CourseModuleWithCourse | null> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.module.updateMany({
        where: { id, status: currentStatus },
        data: { status },
      });
      return result.count === 0
        ? null
        : tx.module.findUnique({
            where: { id },
            include: { course: { select: { status: true } } },
          });
    });
  }

  delete(id: string): Promise<{ id: string; title: string }> {
    return this.prisma.module.delete({
      where: { id },
      select: { id: true, title: true },
    });
  }
}

async function lockCourse(tx: Prisma.TransactionClient, courseId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE
  `;
  return rows.length > 0;
}
