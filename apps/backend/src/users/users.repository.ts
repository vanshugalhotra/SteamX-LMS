/**
 * Runs Prisma queries for users and creates each account with its profile atomically.
 */
import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  Prisma,
  type UserStatus,
  type UserType,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import { USER_DETAIL_SELECT, USER_LIST_SELECT } from './users.types.js';
import type { UserDetailRecord, UserListRecord } from './users.types.js';

export type { UserDetailRecord, UserListRecord } from './users.types.js';

/** Runs user persistence queries; related profile writes stay in the same transaction. */
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
    // The database requires the account and its teacher profile to exist together.
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
    // The database requires the account and its student profile to exist together.
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

  renameSteamxId(where: Prisma.UserWhereInput, steamxId: string): Promise<UserDetailRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // A database trigger blocks steamx_id changes unless steamx.allow_steamx_id_change is on.
      // Transaction-local configuration keeps that exception limited to this rename.
      await tx.$queryRaw`SELECT set_config('steamx.allow_steamx_id_change', 'on', true)`;
      const result = await tx.user.updateMany({
        where,
        data: { steamxId },
      });
      if (result.count === 0) {
        return null;
      }
      return tx.user.findFirst({ where, select: USER_DETAIL_SELECT });
    });
  }

  update(
    userId: string,
    where: Prisma.UserWhereInput,
    userData: Prisma.UserUpdateManyMutationInput,
    schoolId: string,
    profileData?:
      | { teacher: Prisma.TeacherProfileUncheckedUpdateManyInput }
      | { student: Prisma.StudentProfileUncheckedUpdateManyInput },
    classChange?: { newClassSectionId: string; actorId: string },
  ): Promise<{ user: UserDetailRecord | null; completedEnrollments: number }> {
    // User and profile fields must commit together so a partial update is never reported as success.
    return this.prisma.$transaction(async (tx) => {
      const visible = await tx.user.findFirst({ where, select: { id: true } });
      if (!visible) {
        return { user: null, completedEnrollments: 0 };
      }

      if (Object.keys(userData).length > 0) {
        const user = await tx.user.updateMany({ where, data: userData });
        if (user.count === 0) {
          return { user: null, completedEnrollments: 0 };
        }
      }

      let completedEnrollments = 0;
      if (classChange) {
        completedEnrollments = (
          await tx.deliveryEnrollment.updateMany({
            where: {
              studentId: userId,
              schoolId,
              status: EnrollmentStatus.ACTIVE,
              delivery: {
                is: { classSectionId: { not: classChange.newClassSectionId } },
              },
            },
            data: {
              status: EnrollmentStatus.COMPLETED,
              endedAt: new Date(),
              endedById: classChange.actorId,
            },
          })
        ).count;
      }

      if (profileData) {
        if ('teacher' in profileData) {
          const result = await tx.teacherProfile.updateMany({
            where: { userId, schoolId },
            data: profileData.teacher,
          });
          if (result.count === 0) {
            throw new Error('Expected teacher profile update to affect one row');
          }
        } else {
          const result = await tx.studentProfile.updateMany({
            where: { userId, schoolId },
            data: profileData.student,
          });
          if (result.count === 0) {
            throw new Error('Expected student profile update to affect one row');
          }
        }
      }

      return {
        user: await tx.user.findFirst({ where, select: USER_DETAIL_SELECT }),
        completedEnrollments,
      };
    });
  }

  async updateStatus(
    where: Prisma.UserWhereInput,
    status: UserStatus,
  ): Promise<UserDetailRecord | null> {
    const result = await this.prisma.user.updateMany({ where, data: { status } });
    return result.count === 0 ? null : this.findById(where);
  }

  async resetPassword(where: Prisma.UserWhereInput, passwordHash: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where,
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    return result.count > 0;
  }
}
