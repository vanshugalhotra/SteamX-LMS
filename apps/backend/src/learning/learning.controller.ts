import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { LearningCourseListResponseDto } from './dto/learning-course-list-response.dto.js';
import { LearningOutlineResponseDto } from './dto/learning-outline-response.dto.js';
import { LearningService } from './learning.service.js';

@ApiTags('Learning')
@ApiProtectedController()
@ApiForbiddenResponse({ description: 'The caller must be a student with learning.read.' })
@Controller({ path: 'learning' })
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  // ─────────────────────────────────────────
  // GET /learning/courses — List student courses
  // ─────────────────────────────────────────
  /** Lists active learning enrollments and their current progress. */
  @RequirePermission(PERMISSION.LEARNING_READ)
  @Get('courses')
  @ApiOperation({ summary: "List a student's learning courses" })
  @ApiOkResponse({
    description: 'Paginated student learning courses.',
    type: LearningCourseListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Page or limit is invalid.' })
  @ApiForbiddenResponse({ description: 'The caller is not a student or lacks learning.read.' })
  findStudentCourses(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationQueryDto,
  ): Promise<LearningCourseListResponseDto> {
    return this.learning.findStudentCourses(auth, query);
  }

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/outline — Get student outline
  // ─────────────────────────────────────────
  /** Returns the released student lessons for an enrolled delivery. */
  @RequirePermission(PERMISSION.LEARNING_READ)
  @Get('deliveries/:id/outline')
  @ApiOperation({ summary: 'Get a student delivery outline' })
  @ApiOkResponse({
    description: 'Released student lesson outline.',
    type: LearningOutlineResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery not found.' })
  @ApiForbiddenResponse({
    description: 'The caller is not a student, or the course subscription is inactive.',
  })
  getStudentOutline(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
  ): Promise<LearningOutlineResponseDto> {
    return this.learning.getStudentOutline(auth, deliveryId);
  }
}
