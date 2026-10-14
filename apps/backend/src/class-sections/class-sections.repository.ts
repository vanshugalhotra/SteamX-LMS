import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '../generated/prisma/client.js';
import type { ClassSection } from '../generated/prisma/client.js';
import { schoolFilter } from '../common/tenancy/school-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ClassSectionListQueryDto } from './dto/class-section-list-query.dto.js';
import type { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import type { UpdateClassSectionDto } from './dto/update-class-section.dto.js';

@Injectable()
export class ClassSectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async findMany(
    scope: string | undefined,
    query: ClassSectionListQueryDto,
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
    const [items, total] = await Promise.all([
      this.prisma.classSection.findMany({
        where,
        orderBy: [{ className: 'asc' }, { sectionName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.classSection.count({ where }),
    ]);
    return { items, total };
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
