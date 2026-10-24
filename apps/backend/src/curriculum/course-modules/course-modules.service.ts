/** Applies module rules and maps global curriculum persistence to API responses. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus } from '../../generated/prisma/client.js';
import {
  getPostgresCode,
  isForeignKeyViolation,
  isPrismaKnownError,
} from '../../common/errors/prisma-error.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import { canTransitionContentStatus } from '../content-status.js';
import type { CreateCourseModuleDto } from './dto/create-course-module.dto.js';
import type { CourseModuleResponseDto } from './dto/course-module-response.dto.js';
import type { ReorderCourseModulesDto } from './dto/reorder-course-modules.dto.js';
import type { UpdateCourseModuleDto } from './dto/update-course-module.dto.js';
import { toCourseModuleResponse } from './course-modules.mapper.js';
import { CourseModulesRepository } from './course-modules.repository.js';

@Injectable()
export class CourseModulesService {
  constructor(
    private readonly modules: CourseModulesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CourseModulesService.name);
  }

  // ─────────────────────────────────────────
  // POST /courses/:courseId/modules — Create a module
  // ─────────────────────────────────────────

  /** Appends a new draft module to a course. */
  async create(
    actor: AuthContext,
    courseId: string,
    body: CreateCourseModuleDto,
  ): Promise<CourseModuleResponseDto> {
    assertPlatformStaff(actor);
    const module = await this.modules.create(courseId, body);
    if (!module) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info(
      { actorId: actor.userId, courseId, moduleId: module.id },
      'Course module created',
    );
    return toCourseModuleResponse(module);
  }

  // ─────────────────────────────────────────
  // GET /courses/:courseId/modules — List modules
  // ─────────────────────────────────────────

  /** Lists a course's modules by position without pagination. */
  async findMany(actor: AuthContext, courseId: string): Promise<CourseModuleResponseDto[]> {
    assertPlatformStaff(actor);
    const modules = await this.modules.findManyForCourse(courseId);
    if (!modules) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return modules.map((module) => toCourseModuleResponse(module));
  }

  // ─────────────────────────────────────────
  // PUT /courses/:courseId/modules/order — Reorder modules
  // ─────────────────────────────────────────

  /** Replaces a course's full module order. */
  async reorder(
    actor: AuthContext,
    courseId: string,
    body: ReorderCourseModulesDto,
  ): Promise<CourseModuleResponseDto[]> {
    assertPlatformStaff(actor);
    const result = await this.modules.reorder(courseId, body.moduleIds);
    if (result.kind === 'not-found') {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (result.kind === 'invalid-order') {
      throw new BadRequestException(API_ERROR.INVALID_ORDER);
    }
    return result.modules.map((module) => toCourseModuleResponse(module));
  }

  // ─────────────────────────────────────────
  // GET /modules/:id — Get a module
  // ─────────────────────────────────────────

  /** Returns a global module; malformed IDs are rejected by the controller's UUID pipe. */
  async findById(actor: AuthContext, id: string): Promise<CourseModuleResponseDto> {
    assertPlatformStaff(actor);
    const module = await this.modules.findById(id);
    if (!module) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toCourseModuleResponse(module);
  }

  // ─────────────────────────────────────────
  // PATCH /modules/:id — Update a module
  // ─────────────────────────────────────────

  /** Updates a non-empty module patch and logs the actor and target. */
  async update(
    actor: AuthContext,
    id: string,
    body: UpdateCourseModuleDto,
  ): Promise<CourseModuleResponseDto> {
    assertPlatformStaff(actor);
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    const module = await this.modules.update(id, body);
    if (!module) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info({ actorId: actor.userId, moduleId: module.id }, 'Course module updated');
    return toCourseModuleResponse(module);
  }

  // ─────────────────────────────────────────
  // PATCH /modules/:id/status — Update status
  // ─────────────────────────────────────────

  /** Changes module status; database triggers enforce parent and cascade rules. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    status: ContentStatus,
  ): Promise<CourseModuleResponseDto> {
    assertPlatformStaff(actor);
    const current = await this.modules.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (current.status === status) {
      return toCourseModuleResponse(current);
    }
    if (!canTransitionContentStatus(current.status, status)) {
      throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
    }
    if (status === ContentStatus.ACTIVE && current.course.status !== ContentStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.PARENT_NOT_ACTIVE);
    }

    try {
      const module = await this.modules.updateStatus(id, current.status, status);
      if (!module) {
        const latest = await this.modules.findById(id);
        if (!latest) {
          throw new NotFoundException(API_ERROR.NOT_FOUND);
        }
        if (latest.status === status) {
          return toCourseModuleResponse(latest);
        }
        if (status === ContentStatus.ACTIVE && latest.course.status !== ContentStatus.ACTIVE) {
          throw new ConflictException(API_ERROR.PARENT_NOT_ACTIVE);
        }
        throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
      }

      this.logger.info(
        {
          actorId: actor.userId,
          moduleId: module.id,
          oldStatus: current.status,
          newStatus: module.status,
        },
        'Course module status changed',
      );
      return toCourseModuleResponse(module);
    } catch (error) {
      if (
        isPrismaKnownError(error) &&
        (error.code === 'P2004' ||
          getPostgresCode(error) === '23000' ||
          getPostgresCode(error) === '23514')
      ) {
        throw new ConflictException(
          status === ContentStatus.ACTIVE
            ? API_ERROR.PARENT_NOT_ACTIVE
            : API_ERROR.INVALID_STATUS_TRANSITION,
        );
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────
  // DELETE /modules/:id — Delete a module
  // ─────────────────────────────────────────

  /** Deletes a module only when database foreign keys allow it. */
  async delete(actor: AuthContext, id: string): Promise<void> {
    assertPlatformStaff(actor);
    try {
      const module = await this.modules.delete(id);
      this.logger.info(
        { actorId: actor.userId, moduleId: module.id, title: module.title },
        'Course module deleted',
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(API_ERROR.RESOURCE_IN_USE);
      }
      if (isPrismaKnownError(error) && error.code === 'P2025') {
        throw new NotFoundException(API_ERROR.NOT_FOUND);
      }
      throw error;
    }
  }
}
