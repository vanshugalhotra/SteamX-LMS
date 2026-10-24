import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PERMISSION } from '../auth/permissions.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { CreateSchoolDto } from './dto/create-school.dto.js';
import { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import { SchoolListResponseDto } from './dto/school-list-response.dto.js';
import { SchoolResponseDto } from './dto/school-response.dto.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto.js';
import { SchoolsService } from './schools.service.js';

@ApiTags('Schools')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'The required permission is missing, or Origin is invalid.',
})
@Controller({ path: 'schools' })
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  // ─────────────────────────────────────────
  // POST /schools — Create a school
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a school' })
  @ApiCreatedResponse({ description: 'School created.', type: SchoolResponseDto })
  @ApiBadRequestResponse({ description: 'School details are invalid.' })
  @ApiConflictResponse({
    description: 'A school with this code already exists.',
  })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateSchoolDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /schools — List schools
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.SCHOOL_READ)
  @Get()
  @ApiOperation({ summary: 'List schools' })
  @ApiOkResponse({ description: 'Paginated schools.', type: SchoolListResponseDto })
  @ApiBadRequestResponse({
    description: 'Query parameters are invalid.',
  })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: SchoolListQueryDto,
  ): Promise<SchoolListResponseDto> {
    return this.schools.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /schools/:id — Get a school
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.SCHOOL_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a school' })
  @ApiOkResponse({ description: 'School details.', type: SchoolResponseDto })
  @ApiBadRequestResponse({ description: 'The school ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'School not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SchoolResponseDto> {
    return this.schools.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /schools/:id — Update a school
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a school' })
  @ApiOkResponse({ description: 'School updated.', type: SchoolResponseDto })
  @ApiBadRequestResponse({
    description: 'The school ID or update body is invalid.',
  })
  @ApiNotFoundResponse({ description: 'School not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSchoolDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /schools/:id/status — Update status
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a school status' })
  @ApiOkResponse({ description: 'School status updated.', type: SchoolResponseDto })
  @ApiBadRequestResponse({
    description: 'The school ID or status is invalid.',
  })
  @ApiNotFoundResponse({ description: 'School not found.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSchoolStatusDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.updateStatus(actor, id, body.status);
  }
}
