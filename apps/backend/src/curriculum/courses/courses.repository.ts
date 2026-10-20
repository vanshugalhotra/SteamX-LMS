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
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateCourseDto): Promise<Course> {
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        status: ContentStatus.DRAFT,
      },
    });
  }

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

  findById(id: string): Promise<Course | null> {
    return this.prisma.course.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateCourseDto): Promise<Course | null> {
    const result = await this.prisma.course.updateMany({ where: { id }, data });
    return result.count === 0 ? null : this.findById(id);
  }

  async updateStatus(
    id: string,
    currentStatus: ContentStatus,
    status: ContentStatus,
  ): Promise<Course | null> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.course.updateMany({
        where: { id, status: currentStatus },
        data: { status },
      });
      return result.count === 0 ? null : tx.course.findUnique({ where: { id } });
    });
  }
}
