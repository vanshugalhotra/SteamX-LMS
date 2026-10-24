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
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
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
import { CourseListQueryDto } from './dto/course-list-query.dto.js';
import { CourseListResponseDto } from './dto/course-list-response.dto.js';
import { CourseResponseDto } from './dto/course-response.dto.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { UpdateContentStatusDto } from '../dto/update-content-status.dto.js';
import { CoursesService } from './courses.service.js';

@ApiTags('Courses')
@ApiProtectedController()
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@Controller({ path: 'courses' })
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  // ─────────────────────────────────────────
  // POST /courses — Create a course
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create a course' })
  @ApiCreatedResponse({ description: 'Course created as a draft.', type: CourseResponseDto })
  @ApiBadRequestResponse({ description: 'Course details are invalid.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateCourseDto,
  ): Promise<CourseResponseDto> {
    return this.courses.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /courses — List courses
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get()
  @ApiOperation({ summary: 'List courses' })
  @ApiOkResponse({ description: 'Paginated courses.', type: CourseListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: CourseListQueryDto,
  ): Promise<CourseListResponseDto> {
    return this.courses.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /courses/:id — Get a course
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a course' })
  @ApiOkResponse({ description: 'Course details.', type: CourseResponseDto })
  @ApiBadRequestResponse({ description: 'The course ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseResponseDto> {
    return this.courses.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /courses/:id — Update a course
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a course' })
  @ApiOkResponse({ description: 'Course updated.', type: CourseResponseDto })
  @ApiBadRequestResponse({ description: 'The course ID or update body is invalid.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCourseDto,
  ): Promise<CourseResponseDto> {
    return this.courses.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /courses/:id/status — Update status
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a course status' })
  @ApiOkResponse({ description: 'Course status updated.', type: CourseResponseDto })
  @ApiBadRequestResponse({ description: 'The course ID or status is invalid.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  @ApiConflictResponse({ description: 'The requested status transition is not allowed.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateContentStatusDto,
  ): Promise<CourseResponseDto> {
    return this.courses.updateStatus(actor, id, body.status);
  }

  // ─────────────────────────────────────────
  // DELETE /courses/:id — Delete an unused course
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a course' })
  @ApiNoContentResponse({ description: 'Course deleted.' })
  @ApiBadRequestResponse({ description: 'The course ID is not a UUID.' })
  @ApiConflictResponse({ description: 'Course has dependent records and cannot be deleted.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  delete(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.courses.delete(actor, id);
  }
}
