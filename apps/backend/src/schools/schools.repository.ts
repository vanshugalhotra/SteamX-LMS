/**
 * Runs school queries with the resolved school scope included in the database filter.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '../generated/prisma/client.js';
import type { School } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';

// Schools scope by their own id, not by a schoolId FK.
// In findById/update this filter is combined via AND because the lookup id
// and the scope both target the `id` field — a spread would overwrite one.
function selfScopeFilter(scope: string | undefined): Prisma.SchoolWhereInput {
  return scope === undefined ? {} : { id: scope };
}

@Injectable()
export class SchoolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSchoolDto) {
    return this.prisma.school.create({ data });
  }

  async findMany(
    scope: string | undefined,
    query: SchoolListQueryDto,
  ): Promise<{ items: School[]; total: number }> {
    const where: Prisma.SchoolWhereInput = {
      ...selfScopeFilter(scope),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q, mode: 'insensitive' } },
            ],
          }),
    };
    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.school.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string, scope: string | undefined) {
    return this.prisma.school.findFirst({
      where: { AND: [{ id }, selfScopeFilter(scope)] },
    });
  }

  async update(
    id: string,
    scope: string | undefined,
    data: UpdateSchoolDto | { status: SchoolStatus },
  ): Promise<School | null> {
    const result = await this.prisma.school.updateMany({
      where: { AND: [{ id }, selfScopeFilter(scope)] },
      data,
    });
    return result.count === 0 ? null : this.findById(id, scope);
  }
}
