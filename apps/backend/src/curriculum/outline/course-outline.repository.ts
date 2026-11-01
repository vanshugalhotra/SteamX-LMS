/** Read model across courses, modules, and lessons; all writes belong to their feature folders. */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const courseOutlineSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  modules: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      title: true,
      position: true,
      status: true,
      lessons: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          position: true,
          status: true,
          audience: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

export type CourseOutlineRecord = Prisma.CourseGetPayload<{
  select: typeof courseOutlineSelect;
}>;

@Injectable()
export class CourseOutlineRepository {
  /** Injects Prisma for the nested course-outline query. */
  constructor(private readonly prisma: PrismaService) {}

  /** Finds a course with its modules and lessons ordered by position, or returns null. */
  findByCourseId(courseId: string): Promise<CourseOutlineRecord | null> {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      select: courseOutlineSelect,
    });
  }
}
