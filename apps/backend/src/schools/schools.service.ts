/** Applies school access rules and coordinates school persistence for API workflows. */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SchoolStatus, UserType } from '../generated/prisma/client.js';
import { throwConflictOnDuplicate } from '../common/errors/prisma-error.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { CreateSchoolDto } from './dto/create-school.dto.js';
import type { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import type { SchoolResponseDto } from './dto/school-response.dto.js';
import type { UpdateSchoolDto } from './dto/update-school.dto.js';
import { toSchoolResponse } from './schools.mapper.js';
import { SchoolsRepository } from './schools.repository.js';

/** Applies school access rules and maps repository results to API responses. */
@Injectable()
export class SchoolsService {
  constructor(
    private readonly schools: SchoolsRepository,
    private readonly logger: PinoLogger,
  ) {}

  /** Exposes the school code to collaborating modules without exposing repository access. */
  findCodeById(schoolId: string): Promise<{ code: string } | null> {
    return this.schools.findCodeById(schoolId);
  }

  // ─────────────────────────────────────────
  // POST /schools — Create a school
  // ─────────────────────────────────────────

  /** Creates schools only for platform staff, regardless of assigned permissions. */
  async create(actor: AuthContext, body: CreateSchoolDto): Promise<SchoolResponseDto> {
    if (actor.userType !== UserType.PLATFORM_STAFF) {
      // even if a user has SCHOOL_MANAGE permission, they cannot create a school if they are not PLATFORM_STAFF
      throw new ForbiddenException(API_ERROR.SCHOOL_FORBIDDEN);
    }

    try {
      const school = await this.schools.create(body);
      this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School created');
      return toSchoolResponse(school);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.SCHOOL_CODE_EXISTS);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // GET /schools — List schools
  // ─────────────────────────────────────────

  /** Lists schools within the caller's resolved scope. */
  async findMany(
    actor: AuthContext,
    query: SchoolListQueryDto,
  ): Promise<PaginationResponseDto<SchoolResponseDto>> {
    const scope = resolveSchoolScope(actor);
    const { items, total } = await this.schools.findMany(scope, query);
    return paginate(
      items.map((school) => toSchoolResponse(school)),
      query.page,
      query.limit,
      total,
    );
  }

  // ─────────────────────────────────────────
  // GET /schools/:id — Get a school
  // ─────────────────────────────────────────

  /** Returns a school only when it is in the caller's scope; foreign IDs remain 404. */
  async findById(actor: AuthContext, id: string): Promise<SchoolResponseDto> {
    const scope = resolveSchoolScope(actor);
    const school = await this.schools.findById(id, scope);
    if (!school) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toSchoolResponse(school);
  }

  // ─────────────────────────────────────────
  // PATCH /schools/:id — Update a school
  // ─────────────────────────────────────────

  /** Updates a non-empty school patch within the caller's resolved scope. */
  async update(actor: AuthContext, id: string, body: UpdateSchoolDto): Promise<SchoolResponseDto> {
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    const scope = resolveSchoolScope(actor);
    const school = await this.schools.update(id, scope, body);
    if (!school) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School updated');
    return toSchoolResponse(school);
  }

  // ─────────────────────────────────────────
  // PATCH /schools/:id/status — Update status
  // ─────────────────────────────────────────

  /** Changes a school's active state and treats repeating the current state as a no-op. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    status: SchoolStatus,
  ): Promise<SchoolResponseDto> {
    const scope = resolveSchoolScope(actor);
    const current = await this.schools.findById(id, scope);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (current.status === status) {
      return toSchoolResponse(current);
    }

    const school = await this.schools.update(id, scope, { status });
    if (!school) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }

    this.logger.info({ actorId: actor.userId, schoolId: school.id }, 'School status changed');
    return toSchoolResponse(school);
  }
}
