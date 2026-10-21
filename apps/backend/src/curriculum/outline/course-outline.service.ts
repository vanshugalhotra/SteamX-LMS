import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { UserType } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import type { CourseOutlineResponseDto } from './dto/course-outline-response.dto.js';
import { toCourseOutlineResponse } from './course-outline.mapper.js';
import { CourseOutlineRepository } from './course-outline.repository.js';

@Injectable()
export class CourseOutlineService {
  constructor(private readonly outlines: CourseOutlineRepository) {}

  async findByCourseId(actor: AuthContext, id: string): Promise<CourseOutlineResponseDto> {
    this.assertAdmin(actor);
    const course = await this.outlines.findByCourseId(id);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toCourseOutlineResponse(course);
  }

  private assertAdmin(actor: AuthContext): void {
    if (actor.userType !== UserType.PLATFORM_STAFF) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }
  }

  // TODO(deliveries): teacher/student outlines (release + audience filtering) are separate endpoints
}
