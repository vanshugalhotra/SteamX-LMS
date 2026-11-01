/** HTTP and permission boundary for global lesson metadata and content authoring. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { PERMISSION } from '../../auth/permissions.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { CreateLessonDto } from './dto/create-lesson.dto.js';
import { LessonResponseDto } from './dto/lesson-response.dto.js';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto.js';
import { UpdateLessonDto } from './dto/update-lesson.dto.js';
import { UpdateContentStatusDto } from '../dto/update-content-status.dto.js';
import { LessonsService } from './lessons.service.js';

@ApiTags('Lessons')
@ApiProtectedController()
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@Controller()
export class LessonsController {
  /** Injects the service that enforces global lesson rules. */
  constructor(private readonly lessons: LessonsService) {}

  // ─────────────────────────────────────────
  // POST /modules/:moduleId/lessons — Create a lesson
  // ─────────────────────────────────────────

  /** Appends a DRAFT lesson to a module. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Post('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'Create a lesson' })
  @ApiCreatedResponse({ description: 'Lesson created as a draft.', type: LessonResponseDto })
  @ApiBadRequestResponse({ description: 'The module ID or lesson details are invalid.' })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() body: CreateLessonDto,
  ): Promise<LessonResponseDto> {
    return this.lessons.create(actor, moduleId, body);
  }

  // ─────────────────────────────────────────
  // GET /modules/:moduleId/lessons — List lessons
  // ─────────────────────────────────────────

  /** Returns all lessons in the module in position order. */
  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'List lessons in a module' })
  @ApiOkResponse({ description: 'Lessons ordered by position.', type: [LessonResponseDto] })
  @ApiBadRequestResponse({ description: 'The module ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
  ): Promise<LessonResponseDto[]> {
    return this.lessons.findMany(actor, moduleId);
  }

  // ─────────────────────────────────────────
  // PUT /modules/:moduleId/lessons/order — Reorder lessons
  // ─────────────────────────────────────────

  /** Applies a complete permutation of the module's lesson IDs. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Put('modules/:moduleId/lessons/order')
  @ApiOperation({ summary: 'Reorder lessons in a module' })
  @ApiOkResponse({ description: 'Lessons in their updated order.', type: [LessonResponseDto] })
  @ApiBadRequestResponse({
    description: 'The module ID, order body, or complete lesson set is invalid.',
  })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  reorder(
    @CurrentAuth() actor: AuthContext,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() body: ReorderLessonsDto,
  ): Promise<LessonResponseDto[]> {
    return this.lessons.reorder(actor, moduleId, body);
  }

  // ─────────────────────────────────────────
  // GET /lessons/:id — Get a lesson
  // ─────────────────────────────────────────

  /** Returns a lesson or 404 when it does not exist. */
  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('lessons/:id')
  @ApiOperation({ summary: 'Get a lesson' })
  @ApiOkResponse({ description: 'Lesson details.', type: LessonResponseDto })
  @ApiBadRequestResponse({ description: 'The lesson ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LessonResponseDto> {
    return this.lessons.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /lessons/:id — Update a lesson
  // ─────────────────────────────────────────

  /** Updates title and/or audience; module placement is not editable through this route. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch('lessons/:id')
  @ApiOperation({ summary: 'Update a lesson' })
  @ApiOkResponse({ description: 'Lesson updated.', type: LessonResponseDto })
  @ApiBadRequestResponse({ description: 'The lesson ID or update body is invalid.' })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLessonDto,
  ): Promise<LessonResponseDto> {
    return this.lessons.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /lessons/:id/status — Update status
  // ─────────────────────────────────────────

  /** Changes lesson lifecycle status subject to its module's active status. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch('lessons/:id/status')
  @ApiOperation({ summary: 'Update a lesson status' })
  @ApiOkResponse({ description: 'Lesson status updated.', type: LessonResponseDto })
  @ApiBadRequestResponse({ description: 'The lesson ID or status is invalid.' })
  @ApiConflictResponse({
    description: 'The transition is invalid or the parent module is inactive.',
  })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContentStatusDto,
  ): Promise<LessonResponseDto> {
    return this.lessons.updateStatus(actor, id, body.status);
  }

  // ─────────────────────────────────────────
  // DELETE /lessons/:id — Delete a lesson
  // ─────────────────────────────────────────

  /** Deletes a lesson after dependent records, including content blocks, are removed. */
  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Delete('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lesson' })
  @ApiNoContentResponse({ description: 'Lesson deleted.' })
  @ApiBadRequestResponse({ description: 'The lesson ID is not a UUID.' })
  @ApiConflictResponse({
    description: 'Lesson blocks or other dependent records prevent deletion.',
  })
  @ApiNotFoundResponse({ description: 'Lesson not found.' })
  delete(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.lessons.delete(actor, id);
  }
}
