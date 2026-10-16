import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SchoolStatus, UserType, type Prisma } from '../generated/prisma/client.js';
import { PasswordService } from '../auth/services/password.service.js';
import { USER_ROLE_KEY, type UserRoleKey } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { resolveSchoolScope, schoolFilter } from '../common/tenancy/school-scope.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { ClassSectionsService } from '../class-sections/class-sections.service.js';
import { getPasswordPolicyViolations } from '../auth/validators/password-policy.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { CreateTeacherDto } from './dto/create-teacher.dto.js';
import type { UserListQueryDto } from './dto/user-list-query.dto.js';
import type { UserListItemResponseDto } from './dto/user-list-item-response.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';
import { userVisibility } from './user-visibility.js';
import { toUserListItem, toUserResponse } from './users.mapper.js';
import { UsersRepository } from './users.repository.js';
import { SteamxIdService } from './steamx-id.service.js';

const NOT_FOUND = { code: 'NOT_FOUND', message: 'Resource not found' };

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly steamxIds: SteamxIdService,
    private readonly sections: ClassSectionsService,
    private readonly logger: PinoLogger,
  ) {}

  // ─────────────────────────────────────────
  // POST /users/teachers — Create a teacher
  // ─────────────────────────────────────────

  async createTeacher(actor: AuthContext, body: CreateTeacherDto): Promise<UserResponseDto> {
    const schoolId = await this.resolveActiveSchool(actor, body.schoolId);
    const role = await this.resolveRole(USER_ROLE_KEY.TEACHER, UserType.SCHOOL_STAFF);

    return this.steamxIds.withUniqueSteamxId(async (steamxId) => {
      this.validatePassword(body.password, steamxId);
      const passwordHash = await this.passwords.hash(body.password);
      const user = await this.users.createTeacher({
        steamxId,
        name: body.name,
        email: body.email ?? null,
        passwordHash,
        schoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_STAFF,
        primaryAssignment: body.primaryAssignment ?? null,
      });
      this.logger.info(
        { actorId: actor.userId, userId: user.id, schoolId },
        'Teacher user created',
      );
      return toUserResponse(user);
    });
  }

  // ─────────────────────────────────────────
  // POST /users/students — Create a student
  // ─────────────────────────────────────────

  async createStudent(actor: AuthContext, body: CreateStudentDto): Promise<UserResponseDto> {
    const schoolId = await this.resolveActiveSchool(actor, body.schoolId);
    await this.sections.assertInSchool(body.classSectionId, schoolId);
    const role = await this.resolveRole(USER_ROLE_KEY.STUDENT, UserType.STUDENT);

    return this.steamxIds.withUniqueSteamxId(async (steamxId) => {
      this.validatePassword(body.password, steamxId);
      const passwordHash = await this.passwords.hash(body.password);
      const user = await this.users.createStudent({
        steamxId,
        name: body.name,
        passwordHash,
        schoolId,
        roleId: role.id,
        userType: UserType.STUDENT,
        classSectionId: body.classSectionId,
        guardianName: body.guardianName ?? null,
      });
      this.logger.info(
        { actorId: actor.userId, userId: user.id, schoolId },
        'Student user created',
      );
      return toUserResponse(user);
    });
  }

  // ─────────────────────────────────────────
  // GET /users — List users
  // ─────────────────────────────────────────

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

  async findById(actor: AuthContext, id: string): Promise<UserResponseDto> {
    const scope = resolveSchoolScope(actor);
    const user = await this.users.findById({
      ...schoolFilter(scope),
      AND: [{ id }, userVisibility(actor)],
    });
    if (!user) {
      throw new NotFoundException(NOT_FOUND);
    }
    return toUserResponse(user);
  }

  private async resolveActiveSchool(
    actor: AuthContext,
    requestedSchoolId?: string,
  ): Promise<string> {
    const schoolId = resolveSchoolScope(actor, requestedSchoolId);
    if (!schoolId) {
      throw new BadRequestException({
        code: 'SCHOOL_REQUIRED',
        message: 'A school is required',
      });
    }

    const school = await this.users.findSchoolStatus(schoolId);
    if (!school) {
      throw new NotFoundException(NOT_FOUND);
    }
    if (school.status !== SchoolStatus.ACTIVE) {
      throw new ConflictException({ code: 'SCHOOL_INACTIVE', message: 'School is inactive' });
    }
    return schoolId;
  }

  private async resolveRole(roleKey: UserRoleKey, userType: UserType): Promise<{ id: number }> {
    const role = await this.users.findRole(roleKey);
    if (!role || role.userType !== userType) {
      throw new InternalServerErrorException({
        code: 'ROLE_CONFIGURATION_ERROR',
        message: 'User role is not configured correctly',
      });
    }
    return { id: role.id };
  }

  private validatePassword(password: string, steamxId: string): void {
    const violations = getPasswordPolicyViolations(password, steamxId);
    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'PASSWORD_POLICY',
        message: 'Password does not meet policy requirements',
        details: violations,
      });
    }
  }
}
