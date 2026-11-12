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
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { ClassSectionListQueryDto } from './dto/class-section-list-query.dto.js';
import { ClassSectionListResponseDto } from './dto/class-section-list-response.dto.js';
import { ClassSectionResponseDto } from './dto/class-section-response.dto.js';
import { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import { UpdateClassSectionDto } from './dto/update-class-section.dto.js';
import { ClassSectionsService } from './class-sections.service.js';

/** Declares class-section routes and delegates tenant and lifecycle rules to ClassSectionsService. */
@ApiTags('Class sections')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'The required permission is missing, or Origin is invalid.',
})
@Controller({ path: 'class-sections' })
export class ClassSectionsController {
  /** Injects the service that enforces class-section access and business rules. */
  constructor(private readonly sections: ClassSectionsService) {}

  // ─────────────────────────────────────────
  // POST /class-sections — Create a class section
  // ─────────────────────────────────────────

  /** Creates a section in one active school; the school ID is required for platform-wide callers. */
  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a class section' })
  @ApiCreatedResponse({ description: 'Class section created.', type: ClassSectionResponseDto })
  @ApiBadRequestResponse({
    description: 'Class section details are invalid.',
  })
  @ApiConflictResponse({
    description: 'School is inactive or class section already exists.',
  })
  @ApiNotFoundResponse({ description: 'School not found.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateClassSectionDto,
  ): Promise<ClassSectionResponseDto> {
    return this.sections.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /class-sections — List class sections
  // ─────────────────────────────────────────

  /** Returns a paginated section list within the caller's scope, optionally filtered by school and name. */
  @RequirePermission(PERMISSION.CLASSSECTION_READ)
  @Get()
  @ApiOperation({ summary: 'List class sections' })
  @ApiOkResponse({ description: 'Paginated class sections.', type: ClassSectionListResponseDto })
  @ApiBadRequestResponse({
    description: 'Query parameters are invalid.',
  })
  @ApiNotFoundResponse({ description: 'School not found.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: ClassSectionListQueryDto,
  ): Promise<ClassSectionListResponseDto> {
    return this.sections.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /class-sections/:id — Get a class section
  // ─────────────────────────────────────────

  /** Returns a section in the caller's school scope; foreign and missing IDs both return 404. */
  @RequirePermission(PERMISSION.CLASSSECTION_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a class section' })
  @ApiOkResponse({ description: 'Class section details.', type: ClassSectionResponseDto })
  @ApiBadRequestResponse({
    description: 'The class-section ID is not a UUID.',
  })
  @ApiNotFoundResponse({ description: 'Class section not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassSectionResponseDto> {
    return this.sections.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /class-sections/:id — Update a class section
  // ─────────────────────────────────────────

  /** Updates class or section names without allowing the section to move to another school. */
  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a class section' })
  @ApiOkResponse({ description: 'Class section updated.', type: ClassSectionResponseDto })
  @ApiBadRequestResponse({
    description: 'The class-section ID or update body is invalid.',
  })
  @ApiConflictResponse({ description: 'Class section already exists.' })
  @ApiNotFoundResponse({ description: 'Class section not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClassSectionDto,
  ): Promise<ClassSectionResponseDto> {
    return this.sections.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // DELETE /class-sections/:id — Delete a class section
  // ─────────────────────────────────────────

  /** Deletes a section; dependent student profiles or deliveries produce a conflict response. */
  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a class section' })
  @ApiNoContentResponse({ description: 'Class section deleted.' })
  @ApiBadRequestResponse({
    description: 'The class-section ID is not a UUID.',
  })
  @ApiConflictResponse({ description: 'Section has dependent records and cannot be deleted.' })
  @ApiNotFoundResponse({ description: 'Class section not found.' })
  delete(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sections.delete(actor, id);
  }
}
