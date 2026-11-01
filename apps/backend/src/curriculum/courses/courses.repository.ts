/** Runs global course queries and writes through Prisma. */
import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma } from '../../generated/prisma/client.js';
import type { Course } from '../../generated/prisma/client.js';
import { paginatedSearch } from '../../common/repositories/paginated-search.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CourseListQueryDto } from './dto/course-list-query.dto.js';
import type { CreateCourseDto } from './dto/create-course.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';

@Injectable()
export class CoursesRepository {
  /** Injects Prisma for global course queries and writes. */
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a global course in DRAFT status. */
  create(data: CreateCourseDto): Promise<Course> {
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        status: ContentStatus.DRAFT,
      },
    });
  }

  /** Searches global courses by optional status and case-insensitive title query. */
  findMany(query: CourseListQueryDto): Promise<{ items: Course[]; total: number }> {
    const where: Prisma.CourseWhereInput = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined ? {} : { title: { contains: query.q, mode: 'insensitive' } }),
    };
    const orderBy = [
      { createdAt: 'desc' },
      { id: 'asc' },
    ] satisfies Prisma.CourseOrderByWithRelationInput[];

    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.course.findMany(args),
      count: (filter) => this.prisma.course.count({ where: filter }),
    });
  }

  /** Finds a global course by ID, or returns null when it is missing. */
  findById(id: string): Promise<Course | null> {
    return this.prisma.course.findUnique({ where: { id } });
  }

  /** Applies a patch and returns null when the course ID did not match. */
  async update(id: string, data: UpdateCourseDto): Promise<Course | null> {
    const result = await this.prisma.course.updateMany({ where: { id }, data });
    return result.count === 0 ? null : this.findById(id);
  }

  /**
   * Updates status only if it still matches the previously read value.
   * The compare-and-set write runs in a transaction to avoid overwriting a concurrent change.
   */
  async updateStatus(
    id: string,
    currentStatus: ContentStatus,
    status: ContentStatus,
  ): Promise<Course | null> {
    return this.prisma.$transaction(async (tx) => {
      // Compare against the status read by the service so a concurrent transition is not overwritten.
      const result = await tx.course.updateMany({
        where: { id, status: currentStatus },
        data: { status },
      });
      return result.count === 0 ? null : tx.course.findUnique({ where: { id } });
    });
  }

  /** Deletes a course; foreign-key errors are left for the service to translate. */
  delete(id: string): Promise<{ id: string }> {
    return this.prisma.course.delete({
      where: { id },
      select: { id: true },
    });
  }
}
