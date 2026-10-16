/**
 * Runs school queries with the resolved school scope included in the database filter.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '../generated/prisma/client.js';
import type { School } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
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

  findMany(
    scope: string | undefined,
    query: { page: number; limit: number; q?: string; status?: SchoolStatus },
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
    const orderBy = [
      { name: 'asc' },
      { id: 'asc' },
    ] satisfies Prisma.SchoolOrderByWithRelationInput[];
    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) => this.prisma.school.findMany(args),
      count: (filter) => this.prisma.school.count({ where: filter }),
    });
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
