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
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ClassSectionListQueryDto } from './dto/class-section-list-query.dto.js';
import { ClassSectionListResponseDto } from './dto/class-section-list-response.dto.js';
import { ClassSectionResponseDto } from './dto/class-section-response.dto.js';
import { CreateClassSectionDto } from './dto/create-class-section.dto.js';
import { UpdateClassSectionDto } from './dto/update-class-section.dto.js';
import { ClassSectionsService } from './class-sections.service.js';

@ApiTags('Class sections')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({ description: 'The caller lacks the required permission.' })
@Controller({ path: 'class-sections', version: '1' })
export class ClassSectionsController {
  constructor(private readonly sections: ClassSectionsService) {}

  // ─────────────────────────────────────────
  // POST /class-sections — Create a class section
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a class section' })
  @ApiCreatedResponse({ description: 'Class section created.', type: ClassSectionResponseDto })
  @ApiBadRequestResponse({ description: 'Class section details are invalid.' })
  @ApiConflictResponse({ description: 'School is inactive or class section already exists.' })
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

  @RequirePermission(PERMISSION.CLASSSECTION_READ)
  @Get()
  @ApiOperation({ summary: 'List class sections' })
  @ApiOkResponse({ description: 'Paginated class sections.', type: ClassSectionListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
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

  @RequirePermission(PERMISSION.CLASSSECTION_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a class section' })
  @ApiOkResponse({ description: 'Class section details.', type: ClassSectionResponseDto })
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

  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a class section' })
  @ApiOkResponse({ description: 'Class section updated.', type: ClassSectionResponseDto })
  @ApiBadRequestResponse({ description: 'Class section details are invalid.' })
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

  @RequirePermission(PERMISSION.CLASSSECTION_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a class section' })
  @ApiNoContentResponse({ description: 'Class section deleted.' })
  @ApiConflictResponse({ description: 'Class section is in use.' })
  @ApiNotFoundResponse({ description: 'Class section not found.' })
  delete(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sections.delete(actor, id);
  }
}
