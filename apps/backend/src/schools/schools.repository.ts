import { Injectable } from '@nestjs/common';
import { Prisma, SchoolStatus } from '../generated/prisma/client.js';
import type { School } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';

function schoolIdFilter(scope: string | undefined): Prisma.SchoolWhereInput {
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
      ...schoolIdFilter(scope),
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
      where: {
        id,
        ...(scope === undefined ? {} : { AND: [{ id: scope }] }),
      },
    });
  }

  async update(
    id: string,
    scope: string | undefined,
    data: UpdateSchoolDto,
  ): Promise<School | null> {
    const result = await this.prisma.school.updateMany({
      where: {
        id,
        ...(scope === undefined ? {} : { AND: [{ id: scope }] }),
      },
      data,
    });
    return result.count === 0 ? null : this.findById(id, scope);
  }

  async updateStatus(
    id: string,
    scope: string | undefined,
    status: SchoolStatus,
  ): Promise<School | null> {
    const result = await this.prisma.school.updateMany({
      where: {
        id,
        ...(scope === undefined ? {} : { AND: [{ id: scope }] }),
      },
      data: { status },
    });
    return result.count === 0 ? null : this.findById(id, scope);
  }
}
