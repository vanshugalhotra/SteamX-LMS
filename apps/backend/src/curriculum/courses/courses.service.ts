/** Applies course rules and maps global curriculum persistence to API responses. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus, UserType } from '../../generated/prisma/client.js';
import { USER_ROLE_KEY } from '../../auth/permissions.js';
import { getPostgresCode, isPrismaKnownError } from '../../common/errors/prisma-error.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { canTransitionContentStatus } from '../content-status.js';
import type { CourseListQueryDto } from './dto/course-list-query.dto.js';
import type { CourseResponseDto } from './dto/course-response.dto.js';
import type { CreateCourseDto } from './dto/create-course.dto.js';
import type { UpdateCourseDto } from './dto/update-course.dto.js';
import { toCourseResponse } from './courses.mapper.js';
import { CoursesRepository } from './courses.repository.js';

@Injectable()
export class CoursesService {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CoursesService.name);
  }

  // ─────────────────────────────────────────
  // POST /courses — Create a course
  // ─────────────────────────────────────────

  /** Creates global curriculum content in DRAFT status. */
  async create(actor: AuthContext, body: CreateCourseDto): Promise<CourseResponseDto> {
    this.assertAdmin(actor);
    const course = await this.courses.create(body);
    this.logger.info({ actorId: actor.userId, courseId: course.id }, 'Course created');
    return toCourseResponse(course);
  }

  // ─────────────────────────────────────────
  // GET /courses — List courses
  // ─────────────────────────────────────────

  /** Lists global courses using the requested filters and pagination. */
  async findMany(
    actor: AuthContext,
    query: CourseListQueryDto,
  ): Promise<PaginationResponseDto<CourseResponseDto>> {
    this.assertAdmin(actor);
    const { items, total } = await this.courses.findMany(query);
    return paginate(
      items.map((course) => toCourseResponse(course)),
      query.page,
      query.limit,
      total,
    );
  }

  // ─────────────────────────────────────────
  // GET /courses/:id — Get a course
  // ─────────────────────────────────────────

  /** Returns a global course; malformed IDs are rejected by the controller's UUID pipe. */
  async findById(actor: AuthContext, id: string): Promise<CourseResponseDto> {
    this.assertAdmin(actor);
    const course = await this.courses.findById(id);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toCourseResponse(course);
  }

  // ─────────────────────────────────────────
  // PATCH /courses/:id — Update a course
  // ─────────────────────────────────────────

  /** Updates a non-empty course patch and logs the actor and target. */
  async update(actor: AuthContext, id: string, body: UpdateCourseDto): Promise<CourseResponseDto> {
    this.assertAdmin(actor);
    if (Object.values(body).every((value) => value === undefined)) {
      throw new BadRequestException(API_ERROR.EMPTY_UPDATE);
    }

    const course = await this.courses.update(id, body);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    this.logger.info({ actorId: actor.userId, courseId: course.id }, 'Course updated');
    return toCourseResponse(course);
  }

  // ─────────────────────────────────────────
  // PATCH /courses/:id/status — Update status
  // ─────────────────────────────────────────

  /** Changes course status; database triggers remain the backstop for status rules. */
  async updateStatus(
    actor: AuthContext,
    id: string,
    status: ContentStatus,
  ): Promise<CourseResponseDto> {
    this.assertAdmin(actor);
    const current = await this.courses.findById(id);
    if (!current) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    if (current.status === status) {
      return toCourseResponse(current);
    }
    if (!canTransitionContentStatus(current.status, status)) {
      throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
    }

    try {
      const course = await this.courses.updateStatus(id, current.status, status);
      if (!course) {
        const latest = await this.courses.findById(id);
        if (!latest) {
          throw new NotFoundException(API_ERROR.NOT_FOUND);
        }
        if (latest.status === status) {
          return toCourseResponse(latest);
        }
        throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
      }

      this.logger.info(
        {
          actorId: actor.userId,
          courseId: course.id,
          oldStatus: current.status,
          newStatus: course.status,
        },
        'Course status changed',
      );
      return toCourseResponse(course);
    } catch (error) {
      if (
        isPrismaKnownError(error) &&
        (error.code === 'P2004' || getPostgresCode(error) === '23000')
      ) {
        throw new ConflictException(API_ERROR.INVALID_STATUS_TRANSITION);
      }
      throw error;
    }
  }

  private assertAdmin(actor: AuthContext): void {
    if (actor.userType !== UserType.PLATFORM_STAFF || actor.roleKey !== USER_ROLE_KEY.ADMIN) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }
  }
}
