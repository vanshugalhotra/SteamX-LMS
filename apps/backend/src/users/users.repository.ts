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

  /** Loads a role and its account type by key. */
  findRole(key: string) {
    return this.prisma.role.findUnique({
      where: { key },
      select: { id: true, userType: true },
    });
  }

  /**
   * Creates a user and teacher profile in one transaction.
   * @param input Account credentials, school, role, and teacher profile fields.
   * @returns The created user with its selected profile details.
   */
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

  /**
   * Creates a user and student profile in one transaction.
   * @param input Account credentials, school, role, class, and student profile fields.
   * @returns The created user with its selected profile details.
   */
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

  /**
   * Lists matching users in newest-first order.
   * @param where Caller-provided scope and visibility predicates.
   * @param pagination Requested page and limit.
   * @returns The matching page and total count.
   */
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

  /** Loads one user matching the supplied scope and visibility predicates. */
  findById(where: Prisma.UserWhereInput): Promise<UserDetailRecord | null> {
    return this.prisma.user.findFirst({
      where,
      select: USER_DETAIL_SELECT,
    });
  }

  /**
   * Renames a matching user's SteamX ID with the database guard enabled only in this transaction.
   * @param where Caller-provided scope and visibility predicates.
   * @param steamxId New SteamX ID.
   * @returns The updated user, or null when no matching user exists.
   */
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

  /**
   * Updates account and profile fields atomically, completing active enrollments when a student changes class.
   * @param userId User whose profile and enrollments may change.
   * @param where Caller-provided user scope and visibility predicates.
   * @param userData Account fields to update.
   * @param schoolId School that owns the user and related records.
   * @param profileData Optional teacher or student profile changes.
   * @param classChange Optional new class and actor, used to complete enrollments for other classes.
   * @returns The updated user or null, and the number of completed enrollments.
   */
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

  /** Changes a matching user's status and reloads the updated record. */
  async updateStatus(
    where: Prisma.UserWhereInput,
    status: UserStatus,
  ): Promise<UserDetailRecord | null> {
    const result = await this.prisma.user.updateMany({ where, data: { status } });
    return result.count === 0 ? null : this.findById(where);
  }

  /**
   * Replaces a matching user's password hash and requires a password change at next login.
   * @param where Caller-provided user scope and visibility predicates.
   * @param passwordHash New password hash.
   * @returns Whether a user record was updated.
   */
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
