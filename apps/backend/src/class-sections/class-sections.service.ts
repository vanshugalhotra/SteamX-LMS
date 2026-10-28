/** Applies school scope and domain rules to class-section operations. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  isForeignKeyViolation,
  throwConflictOnDuplicate,
  throwNotFoundOnMissing,
} from '../common/errors/prisma-error.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { paginate } from '../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../common/pagination/pagination-response.dto.js';
import { ActiveSchoolService } from '../common/tenancy/active-school.service.js';
import { resolveSchoolScope } from '../common/tenancy/school-scope.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import type { ClassSectionListQueryDto } from './dto/class-section-list-query.dto.js';
import type { ClassSectionResponseDto } from './dto/class-section-response.dto.js';
import type { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import type { UpdateClassSectionDto } from './dto/update-class-section.dto.js';
import { toClassSectionResponse } from './class-sections.mapper.js';
import { ClassSectionsRepository } from './class-sections.repository.js';

/** Applies school scope and domain errors around class-section persistence. */
@Injectable()
export class ClassSectionsService {
  constructor(
    private readonly sections: ClassSectionsRepository,
    private readonly activeSchool: ActiveSchoolService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClassSectionsService.name);
  }

  // ─────────────────────────────────────────
  // POST /class-sections — Create a class section
  // ─────────────────────────────────────────

  /**
   * Creates a section in the caller's active school and returns its response DTO.
   * Missing/inactive/foreign schools and duplicate names produce their domain errors.
   */
  async create(actor: AuthContext, body: CreateClassSectionDto): Promise<ClassSectionResponseDto> {
    const school = await this.activeSchool.resolveSchool(actor, body.schoolId);

    try {
      const section = await this.sections.create(school.id, body);
      this.logger.info(
        { actorId: actor.userId, schoolId: section.schoolId, sectionId: section.id },
        'Class section created',
      );
      return toClassSectionResponse(section);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.CLASS_SECTION_EXISTS);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // GET /class-sections — List class sections
  // ─────────────────────────────────────────

  /** Returns a paginated list of sections in scope, optionally filtered by school and name. */
  async findMany(
    actor: AuthContext,
    query: ClassSectionListQueryDto,
  ): Promise<PaginationResponseDto<ClassSectionResponseDto>> {
    const scope = resolveSchoolScope(actor, query.schoolId);
    const { items, total } = await this.sections.findMany(scope, query);
    return paginate(
      items.map((section) => toClassSectionResponse(section)),
      query.page,
      query.limit,
      total,
    );
  }

  // ─────────────────────────────────────────
  // GET /class-sections/:id — Get a class section
  // ─────────────────────────────────────────

  /** Returns a section in caller scope; missing and foreign IDs throw the same 404. */
  async findById(actor: AuthContext, id: string): Promise<ClassSectionResponseDto> {
    const scope = resolveSchoolScope(actor);
    const section = await this.sections.findById(id, scope);
    if (!section) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toClassSectionResponse(section);
  }

  /** Verifies a referenced section belongs to the supplied school; missing or foreign IDs throw 404. */
  async assertInSchool(id: string, schoolId: string): Promise<void> {
    const section = await this.sections.findById(id, schoolId);
    if (!section) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
  }

  // ─────────────────────────────────────────
  // PATCH /class-sections/:id — Update a class section
  // ─────────────────────────────────────────

  /**
   * Updates names on a section in caller scope and returns its response DTO.
   * Empty patches throw 400, duplicate names throw 409, and missing or foreign IDs throw 404.
   */
  async update(
    actor: AuthContext,
    id: string,
    body: UpdateClassSectionDto,
  ): Promise<ClassSectionResponseDto> {
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    const scope = resolveSchoolScope(actor);
    try {
      const section = await this.sections.update(id, scope, body);
      if (!section) {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      this.logger.info(
        { actorId: actor.userId, schoolId: section.schoolId, sectionId: section.id },
        'Class section updated',
      );
      return toClassSectionResponse(section);
    } catch (error) {
      throwConflictOnDuplicate(error, API_ERROR.CLASS_SECTION_EXISTS);
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // DELETE /class-sections/:id — Delete a class section
  // ─────────────────────────────────────────

  /**
   * Deletes a section in caller scope.
   * Referenced sections throw 409 RESOURCE_IN_USE; missing or foreign IDs throw 404.
   */
  async delete(actor: AuthContext, id: string): Promise<void> {
    const scope = resolveSchoolScope(actor);
    try {
      const section = await this.sections.delete(id, scope);
      this.logger.info(
        { actorId: actor.userId, schoolId: section.schoolId, sectionId: section.id },
        'Class section deleted',
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(API_ERROR.RESOURCE_IN_USE);
      }
      throwNotFoundOnMissing(error);
      throw error;
    }
  }
}
