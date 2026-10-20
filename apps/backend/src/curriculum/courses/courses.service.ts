/** Applies course rules and maps global curriculum persistence to API responses. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { ContentStatus } from '../../generated/prisma/client.js';
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

  async create(actor: AuthContext, body: CreateCourseDto): Promise<CourseResponseDto> {
    const course = await this.courses.create(body);
    this.logger.info({ actorId: actor.userId, courseId: course.id }, 'Course created');
    return toCourseResponse(course);
  }

  async findMany(query: CourseListQueryDto): Promise<PaginationResponseDto<CourseResponseDto>> {
    const { items, total } = await this.courses.findMany(query);
    return paginate(
      items.map((course) => toCourseResponse(course)),
      query.page,
      query.limit,
      total,
    );
  }

  async findById(id: string): Promise<CourseResponseDto> {
    this.assertValidId(id);
    const course = await this.courses.findById(id);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toCourseResponse(course);
  }

  async update(actor: AuthContext, id: string, body: UpdateCourseDto): Promise<CourseResponseDto> {
    this.assertValidId(id);
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

  async updateStatus(
    actor: AuthContext,
    id: string,
    status: ContentStatus,
  ): Promise<CourseResponseDto> {
    this.assertValidId(id);
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

  private assertValidId(id: string): void {
    if (!isUUID(id)) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
  }
}
