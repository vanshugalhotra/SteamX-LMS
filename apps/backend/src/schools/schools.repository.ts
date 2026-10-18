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

  /** Inserts a school; duplicate-code conflicts are translated by SchoolsService. */
  create(data: CreateSchoolDto) {
    return this.prisma.school.create({ data });
  }

  /** Reads only a school's code for another module's SteamX ID validation. */
  findCodeById(schoolId: string): Promise<{ code: string } | null> {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { code: true },
    });
  }

  /**
   * Returns a page and total count using the same scope and optional filters.
   * Name and ID ordering keeps page boundaries stable when names match.
   */
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

  /** Finds an ID only inside the resolved scope; foreign school IDs therefore return null. */
  findById(id: string, scope: string | undefined) {
    return this.prisma.school.findFirst({
      where: { AND: [{ id }, selfScopeFilter(scope)] },
    });
  }

  /**
   * Updates only the matching ID and scope, then reads the updated row.
   * Returns null when no school matched, without first loading a foreign row.
   */
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
