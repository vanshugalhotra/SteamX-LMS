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

/** Enforces school access rules, applies school lifecycle behavior, and maps results to API responses. */
@Injectable()
export class SchoolsService {
  constructor(
    private readonly schools: SchoolsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SchoolsService.name);
  }

  /** Loads a school's code for collaborating modules; returns null when the ID does not exist. */
  findCodeById(schoolId: string): Promise<{ code: string } | null> {
    return this.schools.findCodeById(schoolId);
  }

  // ─────────────────────────────────────────
  // POST /schools — Create a school
  // ─────────────────────────────────────────

  /**
   * Creates a school for platform staff and returns its response DTO.
   * Non-platform actors throw 403; duplicate codes throw the school-code conflict.
   */
  async create(actor: AuthContext, body: CreateSchoolDto): Promise<SchoolResponseDto> {
    if (actor.userType !== UserType.PLATFORM_STAFF) {
      // The service keeps the platform-only rule in force even if grants are customized.
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

  /** Returns a paginated, filtered list; school users are limited to their own school. */
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

  /** Returns a school in caller scope; missing and out-of-scope IDs throw the same 404. */
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

  /**
   * Updates allowed fields in caller scope and returns the school.
   * Empty patches throw 400; missing and foreign IDs throw 404.
   */
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

  /**
   * Changes a school's active state in caller scope and returns the school.
   * Repeating the current state is a no-op; missing and foreign IDs throw 404.
   */
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
