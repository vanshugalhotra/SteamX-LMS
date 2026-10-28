/** Executes class-section queries with the resolved tenant scope included in each filter. */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { ClassSection } from '../generated/prisma/client.js';
import { schoolFilter } from '../common/tenancy/school-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import type { UpdateClassSectionDto } from './dto/update-class-section.dto.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';

/** Runs class-section queries with school scope embedded in the Prisma predicate. */
@Injectable()
export class ClassSectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts a section under the resolved school; omitted sectionName uses the database default. */
  create(schoolId: string, data: CreateClassSectionDto) {
    return this.prisma.classSection.create({
      data: {
        schoolId,
        className: data.className,
        // Omitting the field lets PostgreSQL apply the schema default ("All").
        ...(data.sectionName === undefined ? {} : { sectionName: data.sectionName }),
      },
    });
  }

  /** Returns a page and matching count after applying school scope and name filters. */
  findMany(
    scope: string | undefined,
    query: { page: number; limit: number; q?: string },
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
    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.classSection.findMany(args),
      count: (filter) => this.prisma.classSection.count({ where: filter }),
    });
  }

  /** Finds a section inside school scope; foreign and missing IDs both return null. */
  findById(id: string, scope: string | undefined) {
    return this.prisma.classSection.findFirst({
      where: { id, ...schoolFilter(scope) },
    });
  }

  /** Applies a scoped name patch and returns null when no section matched. */
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

  /** Deletes only a scoped section; FK errors propagate for domain translation by the service. */
  delete(id: string, scope: string | undefined) {
    return this.prisma.classSection.delete({
      where: { id, ...schoolFilter(scope) },
      select: { id: true, schoolId: true },
    });
  }
}
