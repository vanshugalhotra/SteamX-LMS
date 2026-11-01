/** Applies lesson rules and maps global curriculum persistence to API responses. */
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
  throwNotFoundOnMissing,
} from '../../common/errors/prisma-error.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import { canTransitionContentStatus } from '../content-status.js';
import type { CreateLessonDto } from './dto/create-lesson.dto.js';
import type { LessonResponseDto } from './dto/lesson-response.dto.js';
import type { ReorderLessonsDto } from './dto/reorder-lessons.dto.js';
import type { UpdateLessonDto } from './dto/update-lesson.dto.js';
import { toLessonResponse } from './lessons.mapper.js';
import { LessonsRepository } from './lessons.repository.js';

@Injectable()
export class LessonsService {
  /** Injects lesson persistence and the structured logger. */
  constructor(
    private readonly lessons: LessonsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LessonsService.name);
  }

  // ─────────────────────────────────────────
  // POST /modules/:moduleId/lessons — Create a lesson
  // ─────────────────────────────────────────

  /** Appends a new draft lesson to a module. */
  async create(
    actor: AuthContext,
    moduleId: string,
    body: CreateLessonDto,
  ): Promise<LessonResponseDto> {
    assertPlatformStaff(actor);
    const lesson = await this.lessons.create(moduleId, body);
    if (!lesson) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info(
      { actorId: actor.userId, lessonId: lesson.id, moduleId: lesson.moduleId },
      'Lesson created',
    );
    return toLessonResponse(lesson);
  }

  // ─────────────────────────────────────────
  // GET /modules/:moduleId/lessons — List lessons
  // ─────────────────────────────────────────

  /** Lists every lesson in position order without pagination. */
  async findMany(actor: AuthContext, moduleId: string): Promise<LessonResponseDto[]> {
    assertPlatformStaff(actor);
    const lessons = await this.lessons.findManyForModule(moduleId);
    if (!lessons) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return lessons.map((lesson) => toLessonResponse(lesson));
  }

  // ─────────────────────────────────────────
  // PUT /modules/:moduleId/lessons/order — Reorder lessons
  // ─────────────────────────────────────────

  /** Replaces a module's full lesson order. */
  async reorder(
    actor: AuthContext,
    moduleId: string,
    body: ReorderLessonsDto,
  ): Promise<LessonResponseDto[]> {
    assertPlatformStaff(actor);
    const result = await this.lessons.reorder(moduleId, body.lessonIds);
    if (result.kind === 'not-found') {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (result.kind === 'invalid-order') {
      throw new BadRequestException(API_ERROR.INVALID_ORDER);
    }
    return result.lessons.map((lesson) => toLessonResponse(lesson));
  }

  // ─────────────────────────────────────────
  // GET /lessons/:id — Get a lesson
  // ─────────────────────────────────────────

  /** Returns a lesson; malformed IDs are rejected by the controller's UUID pipe. */
  async findById(actor: AuthContext, id: string): Promise<LessonResponseDto> {
    assertPlatformStaff(actor);
    const lesson = await this.lessons.findById(id);
    if (!lesson) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toLessonResponse(lesson);
  }

  // ─────────────────────────────────────────
  // PATCH /lessons/:id — Update a lesson
  // ─────────────────────────────────────────

  /** Updates title and/or audience on a lesson. */
  async update(actor: AuthContext, id: string, body: UpdateLessonDto): Promise<LessonResponseDto> {
    assertPlatformStaff(actor);
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }
    const lesson = await this.lessons.update(id, body);
    if (!lesson) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info({ actorId: actor.userId, lessonId: lesson.id }, 'Lesson updated');
    return toLessonResponse(lesson);
  }

  // ─────────────────────────────────────────
  // PATCH /lessons/:id/status — Update status
  // ─────────────────────────────────────────

  /** Changes lesson status; database triggers enforce parent and cascade rules. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    status: ContentStatus,
  ): Promise<LessonResponseDto> {
    assertPlatformStaff(actor);
    const current = await this.lessons.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (current.status === status) {
      return toLessonResponse(current);
    }
    if (!canTransitionContentStatus(current.status, status)) {
      throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
    }
    if (status === ContentStatus.ACTIVE && current.module.status !== ContentStatus.ACTIVE) {
      throw new ConflictException(API_ERROR.PARENT_NOT_ACTIVE);
    }

    try {
      const lesson = await this.lessons.updateStatus(id, current.status, status);
      if (!lesson) {
        const latest = await this.lessons.findById(id);
        if (!latest) {
          throw new NotFoundException(API_ERROR.NOT_FOUND);
        }
        if (latest.status === status) {
          return toLessonResponse(latest);
        }
        if (status === ContentStatus.ACTIVE && latest.module.status !== ContentStatus.ACTIVE) {
          throw new ConflictException(API_ERROR.PARENT_NOT_ACTIVE);
        }
        throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
      }

      this.logger.info(
        {
          actorId: actor.userId,
          lessonId: lesson.id,
          oldStatus: current.status,
          newStatus: lesson.status,
        },
        'Lesson status changed',
      );
      return toLessonResponse(lesson);
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
  // DELETE /lessons/:id — Delete a lesson
  // ─────────────────────────────────────────

  /** Deletes a lesson only when database foreign keys allow it. */
  async delete(actor: AuthContext, id: string): Promise<void> {
    assertPlatformStaff(actor);
    try {
      const lesson = await this.lessons.delete(id);
      this.logger.info(
        { actorId: actor.userId, lessonId: lesson.id, title: lesson.title },
        'Lesson deleted',
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException({
          ...API_ERROR.RESOURCE_IN_USE,
          message: 'A lesson with content blocks must have its blocks removed first.',
        });
      }
      throwNotFoundOnMissing(error);
      throw error;
    }
  }
}
