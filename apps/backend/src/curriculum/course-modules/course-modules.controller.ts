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
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { PERMISSION } from '../../auth/permissions.js';
import { CreateCourseModuleDto } from './dto/create-course-module.dto.js';
import { CourseModuleResponseDto } from './dto/course-module-response.dto.js';
import { ReorderCourseModulesDto } from './dto/reorder-course-modules.dto.js';
import { UpdateCourseModuleDto } from './dto/update-course-module.dto.js';
import { UpdateCourseModuleStatusDto } from './dto/update-course-module-status.dto.js';
import { CourseModulesService } from './course-modules.service.js';

@ApiTags('Course Modules')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({
  description:
    'The required curriculum permission is missing, the caller is not an admin, or Origin is invalid.',
})
@ApiInternalServerErrorResponse({ description: 'An unexpected server error occurred.' })
@Controller()
export class CourseModulesController {
  constructor(private readonly modules: CourseModulesService) {}

  // ─────────────────────────────────────────
  // POST /courses/:courseId/modules — Create a module
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Post('courses/:courseId/modules')
  @ApiOperation({ summary: 'Create a course module' })
  @ApiCreatedResponse({ description: 'Module created as a draft.', type: CourseModuleResponseDto })
  @ApiBadRequestResponse({ description: 'The course ID or module details are invalid.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateCourseModuleDto,
  ): Promise<CourseModuleResponseDto> {
    return this.modules.create(actor, courseId, body);
  }

  // ─────────────────────────────────────────
  // GET /courses/:courseId/modules — List modules
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('courses/:courseId/modules')
  @ApiOperation({ summary: 'List modules in a course' })
  @ApiOkResponse({ description: 'Modules ordered by position.', type: [CourseModuleResponseDto] })
  @ApiBadRequestResponse({ description: 'The course ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<CourseModuleResponseDto[]> {
    return this.modules.findMany(actor, courseId);
  }

  // ─────────────────────────────────────────
  // PUT /courses/:courseId/modules/order — Reorder modules
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Put('courses/:courseId/modules/order')
  @ApiOperation({ summary: 'Reorder course modules' })
  @ApiOkResponse({
    description: 'Modules in their updated order.',
    type: [CourseModuleResponseDto],
  })
  @ApiBadRequestResponse({
    description: 'The course ID, order body, or complete course module set is invalid.',
  })
  @ApiNotFoundResponse({ description: 'Course not found.' })
  reorder(
    @CurrentAuth() actor: AuthContext,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: ReorderCourseModulesDto,
  ): Promise<CourseModuleResponseDto[]> {
    return this.modules.reorder(actor, courseId, body);
  }

  // ─────────────────────────────────────────
  // GET /modules/:id — Get a module
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_READ)
  @Get('modules/:id')
  @ApiOperation({ summary: 'Get a course module' })
  @ApiOkResponse({ description: 'Module details.', type: CourseModuleResponseDto })
  @ApiBadRequestResponse({ description: 'The module ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseModuleResponseDto> {
    return this.modules.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /modules/:id — Update a module
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch('modules/:id')
  @ApiOperation({ summary: 'Update a course module' })
  @ApiOkResponse({ description: 'Module updated.', type: CourseModuleResponseDto })
  @ApiBadRequestResponse({ description: 'The module ID or title is invalid.' })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCourseModuleDto,
  ): Promise<CourseModuleResponseDto> {
    return this.modules.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /modules/:id/status — Update status
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Patch('modules/:id/status')
  @ApiOperation({ summary: 'Update a course module status' })
  @ApiOkResponse({ description: 'Module status updated.', type: CourseModuleResponseDto })
  @ApiBadRequestResponse({ description: 'The module ID or status is invalid.' })
  @ApiConflictResponse({
    description: 'The transition is invalid or the parent course is inactive.',
  })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCourseModuleStatusDto,
  ): Promise<CourseModuleResponseDto> {
    return this.modules.updateStatus(actor, id, body.status);
  }

  // ─────────────────────────────────────────
  // DELETE /modules/:id — Delete a module
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CURRICULUM_WRITE)
  @Delete('modules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a course module' })
  @ApiNoContentResponse({ description: 'Module deleted.' })
  @ApiBadRequestResponse({ description: 'The module ID is not a UUID.' })
  @ApiConflictResponse({ description: 'Module has lessons or other dependent records.' })
  @ApiNotFoundResponse({ description: 'Module not found.' })
  delete(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.modules.delete(actor, id);
  }
}
