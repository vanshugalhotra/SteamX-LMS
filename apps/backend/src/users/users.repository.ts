/**
 * Runs Prisma queries for users and creates each account with its profile atomically.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, type UserType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';

const USER_LIST_SELECT = {
  id: true,
  steamxId: true,
  name: true,
  email: true,
  status: true,
  role: { select: { key: true, name: true } },
  userType: true,
  schoolId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  ...USER_LIST_SELECT,
  mustChangePassword: true,
  studentProfile: { select: { guardianName: true, classSectionId: true } },
  teacherProfile: { select: { primaryAssignment: true } },
} satisfies Prisma.UserSelect;

export type UserListRecord = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;
export type UserDetailRecord = Prisma.UserGetPayload<{ select: typeof USER_DETAIL_SELECT }>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRole(key: string) {
    return this.prisma.role.findUnique({
      where: { key },
      select: { id: true, userType: true },
    });
  }

  async createTeacher(input: {
    steamxId: string;
    name: string;
    email: string | null;
    passwordHash: string;
    schoolId: string;
    roleId: number;
    userType: UserType;
    primaryAssignment: string | null;
  }): Promise<UserDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          steamxId: input.steamxId,
          name: input.name,
          email: input.email,
          passwordHash: input.passwordHash,
          schoolId: input.schoolId,
          roleId: input.roleId,
          userType: input.userType,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await tx.teacherProfile.create({
        data: {
          userId: user.id,
          schoolId: input.schoolId,
          primaryAssignment: input.primaryAssignment,
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: USER_DETAIL_SELECT,
      });
    });
  }

  async createStudent(input: {
    steamxId: string;
    name: string;
    passwordHash: string;
    schoolId: string;
    roleId: number;
    userType: UserType;
    classSectionId: string;
    guardianName: string | null;
  }): Promise<UserDetailRecord> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          steamxId: input.steamxId,
          name: input.name,
          passwordHash: input.passwordHash,
          schoolId: input.schoolId,
          roleId: input.roleId,
          userType: input.userType,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await tx.studentProfile.create({
        data: {
          userId: user.id,
          schoolId: input.schoolId,
          classSectionId: input.classSectionId,
          guardianName: input.guardianName,
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: USER_DETAIL_SELECT,
      });
    });
  }

  async findMany(
    where: Prisma.UserWhereInput,
    pagination: { page: number; limit: number },
  ): Promise<{ items: UserListRecord[]; total: number }> {
    const orderBy = [
      { createdAt: 'desc' },
      { id: 'asc' },
    ] satisfies Prisma.UserOrderByWithRelationInput[];
    return paginatedSearch({
      where,
      orderBy,
      page: pagination.page,
      limit: pagination.limit,
      findMany: (args) =>
        this.prisma.user.findMany({
          ...args,
          select: USER_LIST_SELECT,
        }),
      count: (filter) => this.prisma.user.count({ where: filter }),
    });
  }

  findById(where: Prisma.UserWhereInput): Promise<UserDetailRecord | null> {
    return this.prisma.user.findFirst({
      where,
      select: USER_DETAIL_SELECT,
    });
  }
}
