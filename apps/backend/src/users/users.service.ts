/** Applies user-management rules across tenancy, schools, class sections, and persistence. */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { UserType, type Prisma } from '../generated/prisma/client.js';
import { PasswordService } from '../auth/services/password.service.js';
import { USER_ROLE_KEY, type UserRoleKey } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ActiveSchoolService } from '../common/tenancy/active-school.service.js';
import { resolveSchoolScope, schoolFilter } from '../common/tenancy/school-scope.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { ClassSectionsService } from '../class-sections/class-sections.service.js';
import { SchoolsService } from '../schools/schools.service.js';
import { getPasswordPolicyViolations } from '../common/validators/password-policy.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { throwConflictOnDuplicate } from '../common/errors/prisma-error.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { CreateTeacherDto } from './dto/create-teacher.dto.js';
import type { UserListQueryDto } from './dto/user-list-query.dto.js';
import type { UserListItemResponseDto } from './dto/user-list-item-response.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';
import type { RenameSteamxIdDto } from './dto/rename-steamx-id.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { userVisibility } from './user-visibility.js';
import { toUserListItem, toUserResponse } from './users.mapper.js';
import { UsersRepository, type UserDetailRecord } from './users.repository.js';
import { SteamxIdService } from './steamx-id/steamx-id.service.js';
import { isValidSteamxId } from './steamx-id/steamx-id.js';

/** Orchestrates user lifecycle rules across auth, tenancy, school, and profile modules. */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly steamxIds: SteamxIdService,
    private readonly sections: ClassSectionsService,
    private readonly schools: SchoolsService,
    private readonly activeSchool: ActiveSchoolService,
    private readonly logger: PinoLogger,
  ) {}

  // ─────────────────────────────────────────
  // POST /users/teachers — Create a teacher
  // ─────────────────────────────────────────

  /** Creates a teacher in an active scoped school with a unique login ID and hashed password. */
  async createTeacher(actor: AuthContext, body: CreateTeacherDto): Promise<UserResponseDto> {
    const school = await this.activeSchool.resolveSchool(actor, body.schoolId);
    const role = await this.resolveRole(USER_ROLE_KEY.TEACHER, UserType.SCHOOL_STAFF);

    return this.steamxIds.withUniqueSteamxId(
      { schoolCode: school.code, name: body.name },
      async (steamxId) => {
        this.validatePassword(body.password, steamxId);
        const passwordHash = await this.passwords.hash(body.password);
        const user = await this.users.createTeacher({
          steamxId,
          name: body.name,
          email: body.email ?? null,
          passwordHash,
          schoolId: school.id,
          roleId: role.id,
          userType: UserType.SCHOOL_STAFF,
          primaryAssignment: body.primaryAssignment ?? null,
        });
        this.logger.info(
          { actorId: actor.userId, userId: user.id, schoolId: school.id },
          'Teacher user created',
        );
        return toUserResponse(user);
      },
    );
  }

  // ─────────────────────────────────────────
  // POST /users/students — Create a student
  // ─────────────────────────────────────────

  /** Creates a student only when the selected class section belongs to the active school. */
  async createStudent(actor: AuthContext, body: CreateStudentDto): Promise<UserResponseDto> {
    const school = await this.activeSchool.resolveSchool(actor, body.schoolId);
    await this.sections.assertInSchool(body.classSectionId, school.id);
    const role = await this.resolveRole(USER_ROLE_KEY.STUDENT, UserType.STUDENT);

    return this.steamxIds.withUniqueSteamxId(
      { schoolCode: school.code, name: body.name },
      async (steamxId) => {
        this.validatePassword(body.password, steamxId);
        const passwordHash = await this.passwords.hash(body.password);
        const user = await this.users.createStudent({
          steamxId,
          name: body.name,
          passwordHash,
          schoolId: school.id,
          roleId: role.id,
          userType: UserType.STUDENT,
          classSectionId: body.classSectionId,
          guardianName: body.guardianName ?? null,
        });
        this.logger.info(
          { actorId: actor.userId, userId: user.id, schoolId: school.id },
          'Student user created',
        );
        return toUserResponse(user);
      },
    );
  }

  // ─────────────────────────────────────────
  // GET /users — List users
  // ─────────────────────────────────────────

  /** Combines school scope and user visibility before querying to avoid leaking foreign records. */
  async findMany(
    actor: AuthContext,
    query: UserListQueryDto,
  ): Promise<PaginationResponseDto<UserListItemResponseDto>> {
    const scope = resolveSchoolScope(actor, query.schoolId);
    const where: Prisma.UserWhereInput = {
      ...schoolFilter(scope),
      ...userVisibility(actor),
      ...(query.role === undefined ? {} : { role: { is: { key: query.role } } }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { steamxId: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }),
    };
    const { items, total } = await this.users.findMany(where, query);
    return paginate(items.map(toUserListItem), query.page, query.limit, total);
  }

  // ─────────────────────────────────────────
  // GET /users/:id — Get a user
  // ─────────────────────────────────────────

  /** Finds a user under both school scope and role-specific visibility; missing and foreign IDs return 404. */
  async findById(actor: AuthContext, id: string): Promise<UserResponseDto> {
    const scope = resolveSchoolScope(actor);
    const user = await this.users.findById({
      ...schoolFilter(scope),
      // Keep ID and visibility predicates together in the lookup instead of checking ownership after fetch.
      AND: [{ id }, userVisibility(actor)],
    });
    if (!user) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toUserResponse(user);
  }

  /**
   * Renames a user's school-prefixed ID after checking visibility and validating the school code.
   * The repository enables the database guard only inside the rename transaction.
   */
  async renameSteamxId(
    actor: AuthContext,
    id: string,
    body: RenameSteamxIdDto,
  ): Promise<UserResponseDto> {
    const scope = resolveSchoolScope(actor);
    const where: Prisma.UserWhereInput = {
      AND: [{ id }, schoolFilter(scope), userVisibility(actor)],
    };
    const user = await this.users.findById(where);
    if (!user) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (user.schoolId === null) {
      throw new BadRequestException(API_ERROR.STEAMX_ID_NOT_RENAMABLE);
    }

    const school = await this.schools.findCodeById(user.schoolId);
    if (!school || !isValidSteamxId(body.steamxId, school.code)) {
      throw new BadRequestException(API_ERROR.INVALID_STEAMX_ID);
    }
    if (body.steamxId === user.steamxId) {
      return toUserResponse(user);
    }

    try {
      const renamed = await this.users.renameSteamxId(where, body.steamxId);
      if (!renamed) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      this.logger.info(
        {
          actorId: actor.userId,
          userId: renamed.id,
          oldSteamxId: user.steamxId,
          newSteamxId: renamed.steamxId,
        },
        'User SteamX ID renamed',
      );
      return toUserResponse(renamed);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.STEAMX_ID_TAKEN);
      throw error;
    }
  }

  /** Applies only fields valid for the target account type and updates the profile atomically. */
  async update(actor: AuthContext, id: string, body: UpdateUserDto): Promise<UserResponseDto> {
    const { user, where } = await this.findVisibleTarget(actor, id);
    this.assertSchoolUser(user);

    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    if (
      (user.userType === UserType.STUDENT &&
        (body.email !== undefined || body.primaryAssignment !== undefined)) ||
      (user.userType === UserType.SCHOOL_STAFF &&
        (body.guardianName !== undefined || body.classSectionId !== undefined))
    ) {
      throw new BadRequestException(API_ERROR.FIELD_NOT_APPLICABLE);
    }

    const userData: Prisma.UserUpdateManyMutationInput = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.email === undefined ? {} : { email: body.email }),
    };

    let profileData:
      | { teacher: Prisma.TeacherProfileUncheckedUpdateManyInput }
      | { student: Prisma.StudentProfileUncheckedUpdateManyInput }
      | undefined;
    if (user.userType === UserType.SCHOOL_STAFF && body.primaryAssignment !== undefined) {
      profileData = { teacher: { primaryAssignment: body.primaryAssignment } };
    }
    if (user.userType === UserType.STUDENT) {
      const studentData: Prisma.StudentProfileUncheckedUpdateManyInput = {};
      if (body.guardianName !== undefined) {
        studentData.guardianName = body.guardianName;
      }
      if (
        body.classSectionId !== undefined &&
        body.classSectionId !== user.studentProfile?.classSectionId
      ) {
        // TODO(enrollments): mark old-class enrollments COMPLETED
        await this.sections.assertInSchool(body.classSectionId, user.schoolId);
        studentData.classSectionId = body.classSectionId;
      }
      if (Object.keys(studentData).length > 0) {
        profileData = { student: studentData };
      }
    }

    if (Object.keys(userData).length === 0 && profileData === undefined) {
      return toUserResponse(user);
    }

    try {
      const updated = await this.users.update(id, where, userData, user.schoolId, profileData);
      if (!updated) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      this.logger.info(
        { actorId: actor.userId, userId: updated.id, schoolId: updated.schoolId },
        'User updated',
      );
      return toUserResponse(updated);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.CONFLICT);
      throw error;
    }
  }

  /** Changes another manageable school user's status; self-changes are rejected. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    body: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    const { user, where } = await this.findVisibleTarget(actor, id);
    if (user.id === actor.userId) {
      throw new BadRequestException(API_ERROR.CANNOT_DEACTIVATE_SELF);
    }
    this.assertSchoolUser(user);
    if (user.status === body.status) {
      return toUserResponse(user);
    }

    const updated = await this.users.updateStatus(where, body.status);
    if (!updated) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info(
      {
        actorId: actor.userId,
        userId: updated.id,
        oldStatus: user.status,
        newStatus: updated.status,
      },
      'User status changed',
    );
    return toUserResponse(updated);
  }

  /** Resets another visible user's password and requires a password change at next login. */
  async resetPassword(actor: AuthContext, userId: string, newPassword: string): Promise<void> {
    const { user, where } = await this.findVisibleTarget(actor, userId);
    if (user.id === actor.userId) {
      throw new BadRequestException(API_ERROR.CANNOT_RESET_OWN_PASSWORD);
    }

    this.validatePassword(newPassword, user.steamxId);
    const passwordHash = await this.passwords.hash(newPassword);
    const updated = await this.users.resetPassword(where, passwordHash);
    if (!updated) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info({ actorId: actor.userId, targetId: user.id }, 'Password reset');
  }

  /**
   * Builds the combined ownership and visibility predicate used by user mutations.
   * Returning 404 for foreign or invisible IDs prevents callers from probing account existence.
   */
  private async findVisibleTarget(
    actor: AuthContext,
    id: string,
  ): Promise<{ user: UserDetailRecord; where: Prisma.UserWhereInput }> {
    const scope = resolveSchoolScope(actor);
    const where: Prisma.UserWhereInput = {
      AND: [{ id }, schoolFilter(scope), userVisibility(actor)],
    };
    const user = await this.users.findById(where);
    if (!user) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return { user, where };
  }

  /** Prevents this management API from mutating platform staff accounts. */
  private assertSchoolUser(
    user: UserDetailRecord,
  ): asserts user is UserDetailRecord & { schoolId: string } {
    if (user.schoolId === null) {
      throw new BadRequestException(API_ERROR.USER_NOT_MANAGEABLE);
    }
  }

  /** Treats missing or mismatched role seed data as a server configuration error. */
  private async resolveRole(roleKey: UserRoleKey, userType: UserType): Promise<{ id: number }> {
    const role = await this.users.findRole(roleKey);
    if (!role || role.userType !== userType) {
      throw new InternalServerErrorException(API_ERROR.ROLE_CONFIGURATION_ERROR);
    }
    return { id: role.id };
  }

  /** Reuses the shared password policy for account creation and administrative resets. */
  private validatePassword(password: string, steamxId: string): void {
    const violations = getPasswordPolicyViolations(password, steamxId);
    if (violations.length > 0) {
      throw new BadRequestException({ ...API_ERROR.PASSWORD_POLICY, details: violations });
    }
  }
}
