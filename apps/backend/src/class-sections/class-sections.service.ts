import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { isPrismaKnownError, throwConflictOnDuplicate } from '../common/errors/prisma-error.js';
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

@Injectable()
export class ClassSectionsService {
  constructor(
    private readonly sections: ClassSectionsRepository,
    private readonly activeSchool: ActiveSchoolService,
    private readonly logger: PinoLogger,
  ) {}

  // ─────────────────────────────────────────
  // POST /class-sections — Create a class section
  // ─────────────────────────────────────────

  async create(actor: AuthContext, body: CreateClassSectionDto): Promise<ClassSectionResponseDto> {
    const schoolId = await this.activeSchool.resolve(actor, body.schoolId);

    try {
      const section = await this.sections.create(schoolId, body);
      this.logger.info(
        { actorId: actor.userId, schoolId: section.schoolId, sectionId: section.id },
        'Class section created',
      );
      return toClassSectionResponse(section);
    } catch (error) {
      throwConflictOnDuplicate(error, {
        ...API_ERROR.CLASS_SECTION_EXISTS,
      });
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // GET /class-sections — List class sections
  // ─────────────────────────────────────────

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

  async findById(actor: AuthContext, id: string): Promise<ClassSectionResponseDto> {
    const scope = resolveSchoolScope(actor);
    const section = await this.sections.findById(id, scope);
    if (!section) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toClassSectionResponse(section);
  }

  async assertInSchool(id: string, schoolId: string): Promise<void> {
    const section = await this.sections.findById(id, schoolId);
    if (!section) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
  }

  // ─────────────────────────────────────────
  // PATCH /class-sections/:id — Update a class section
  // ─────────────────────────────────────────

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
      throwConflictOnDuplicate(error, {
        ...API_ERROR.CLASS_SECTION_EXISTS,
      });
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // DELETE /class-sections/:id — Delete a class section
  // ─────────────────────────────────────────

  async delete(actor: AuthContext, id: string): Promise<void> {
    const scope = resolveSchoolScope(actor);
    try {
      const section = await this.sections.delete(id, scope);
      this.logger.info(
        { actorId: actor.userId, schoolId: section.schoolId, sectionId: section.id },
        'Class section deleted',
      );
    } catch (error) {
      if (isPrismaKnownError(error) && error.code === 'P2003') {
        throw new ConflictException(API_ERROR.CLASS_SECTION_IN_USE);
      }
      if (isPrismaKnownError(error) && error.code === 'P2025') {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      throw error;
    }
  }
}
