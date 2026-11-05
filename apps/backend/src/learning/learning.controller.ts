import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
import { LearningAssetAccessResponseDto } from './dto/learning-asset-access-response.dto.js';
import { LearningLessonContentResponseDto } from './dto/learning-lesson-content-response.dto.js';
import { LearningOutlineResponseDto } from './dto/learning-outline-response.dto.js';
import { LearningService } from './learning.service.js';

@ApiTags('Learning')
@ApiProtectedController()
@ApiForbiddenResponse({ description: 'The caller must have learning.read for their role.' })
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

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/lessons/:lessonId/content — Read lesson content
  // ─────────────────────────────────────────
  /** Returns the gated lesson tree and safe asset summaries to an authorized student or teacher. */
  @RequirePermission(PERMISSION.LEARNING_READ)
  @Get('deliveries/:id/lessons/:lessonId/content')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read lesson content for a delivery' })
  @ApiOkResponse({
    description: 'Lesson content and summaries for assets referenced by its blocks.',
    type: LearningLessonContentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery or lesson ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Lesson not found or not visible to the caller.' })
  @ApiForbiddenResponse({
    description: 'The caller is not a student or teacher, or the course subscription is inactive.',
  })
  getLessonContent(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<LearningLessonContentResponseDto> {
    return this.learning.getLessonContent(auth, deliveryId, lessonId);
  }

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/lessons/:lessonId/assets/:assetId/access — Serve lesson asset
  // ─────────────────────────────────────────
  /** Issues a short-lived asset URL and identity data for the lesson watermark overlay. */
  @RequirePermission(PERMISSION.LEARNING_READ)
  @Get('deliveries/:id/lessons/:lessonId/assets/:assetId/access')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get a lesson asset access URL' })
  @ApiOkResponse({
    description: 'Short-lived URL and viewer data for a READY asset referenced by the lesson.',
    type: LearningAssetAccessResponseDto,
  })
  @ApiBadRequestResponse({ description: 'A delivery, lesson, or asset ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Asset not found or not visible in this lesson.' })
  @ApiForbiddenResponse({
    description: 'The caller lacks learning.read, or the course subscription is inactive.',
  })
  getLessonAssetAccess(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<LearningAssetAccessResponseDto> {
    return this.learning.getLessonAssetAccess(auth, deliveryId, lessonId, assetId);
  }
}
