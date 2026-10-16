import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '../generated/prisma/client.js';
import type { ClassSection } from '../generated/prisma/client.js';
import { schoolFilter } from '../common/tenancy/school-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import type { UpdateClassSectionDto } from './dto/update-class-section.dto.js';
import { BaseRepository } from '../common/repositories/base.repository.js';
import type {
  PaginationParams,
  TextSearchParams,
} from '../common/repositories/repository-search.types.js';

@Injectable()
export class ClassSectionsRepository extends BaseRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findSchoolStatus(schoolId: string): Promise<{ status: SchoolStatus } | null> {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { status: true },
    });
  }

  create(schoolId: string, data: CreateClassSectionDto) {
    return this.prisma.classSection.create({
      data: {
        schoolId,
        className: data.className,
        ...(data.sectionName === undefined ? {} : { sectionName: data.sectionName }),
      },
    });
  }

  findMany(
    scope: string | undefined,
    query: PaginationParams & TextSearchParams,
  ): Promise<{ items: ClassSection[]; total: number }> {
    const where: Prisma.ClassSectionWhereInput = {
      ...schoolFilter(scope),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { className: { contains: query.q, mode: 'insensitive' } },
              { sectionName: { contains: query.q, mode: 'insensitive' } },
            ],
          }),
    };
    const orderBy = [
      { className: 'asc' },
      { sectionName: 'asc' },
      { id: 'asc' },
    ] satisfies Prisma.ClassSectionOrderByWithRelationInput[];
    return this.search({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.classSection.findMany(args),
      count: (filter) => this.prisma.classSection.count({ where: filter }),
    });
  }

  findById(id: string, scope: string | undefined) {
    return this.prisma.classSection.findFirst({
      where: { id, ...schoolFilter(scope) },
    });
  }

  async update(
    id: string,
    scope: string | undefined,
    data: UpdateClassSectionDto,
  ): Promise<ClassSection | null> {
    const result = await this.prisma.classSection.updateMany({
      where: { id, ...schoolFilter(scope) },
      data,
    });
    return result.count === 0 ? null : this.findById(id, scope);
  }

  delete(id: string, scope: string | undefined) {
    return this.prisma.classSection.delete({
      where: { id, ...schoolFilter(scope) },
      select: { id: true, schoolId: true },
    });
  }
}
