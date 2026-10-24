import { Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR } from '../../common/errors/api-errors.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { assertPlatformStaff } from '../../auth/assert-platform-staff.js';
import type { CourseOutlineResponseDto } from './dto/course-outline-response.dto.js';
import { toCourseOutlineResponse } from './course-outline.mapper.js';
import { CourseOutlineRepository } from './course-outline.repository.js';

@Injectable()
export class CourseOutlineService {
  constructor(private readonly outlines: CourseOutlineRepository) {}

  async findByCourseId(actor: AuthContext, id: string): Promise<CourseOutlineResponseDto> {
    assertPlatformStaff(actor);
    const course = await this.outlines.findByCourseId(id);
    if (!course) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toCourseOutlineResponse(course);
  }

  // TODO(deliveries): teacher/student outlines (release + audience filtering) are separate endpoints
}
