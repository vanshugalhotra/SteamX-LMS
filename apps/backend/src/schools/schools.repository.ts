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

/**
 * Builds a scope predicate for the school row itself, whose tenant key is its ID.
 * The repository combines this with a target ID using AND to preserve both conditions.
 */
function selfScopeFilter(scope: string | undefined): Prisma.SchoolWhereInput {
  return scope === undefined ? {} : { id: scope };
}

@Injectable()
export class SchoolsRepository {
  /** Injects Prisma for school queries and writes. */
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts the validated school fields; duplicate codes propagate for SchoolsService translation. */
  create(data: CreateSchoolDto) {
    return this.prisma.school.create({ data });
  }

  /** Returns only the school code for cross-module ID validation, or null if the school is missing. */
  findCodeById(schoolId: string): Promise<{ code: string } | null> {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { code: true },
    });
  }

  /**
   * Returns a page and matching total within scope, filtered by status and/or name/code search.
   * Name then ID ordering keeps page boundaries stable when names match.
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

  /** Finds the requested school inside scope; a foreign or missing ID returns null. */
  findById(id: string, scope: string | undefined) {
    return this.prisma.school.findFirst({
      where: { AND: [{ id }, selfScopeFilter(scope)] },
    });
  }

  /**
   * Applies the patch only to the matching ID and scope, then returns the updated row.
   * Returns null when nothing matched, without first loading a foreign row.
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
