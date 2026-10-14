import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PERMISSION } from '../auth/permissions.js';
import { CreateSchoolDto } from './dto/create-school.dto.js';
import { SchoolListQueryDto } from './dto/school-list-query.dto.js';
import { SchoolListResponseDto } from './dto/school-list-response.dto.js';
import { SchoolResponseDto } from './dto/school-response.dto.js';
import { UpdateSchoolDto } from './dto/update-school.dto.js';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto.js';
import { SchoolsService } from './schools.service.js';

@ApiTags('Schools')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({ description: 'The caller lacks the required permission.' })
@Controller({ path: 'schools', version: '1' })
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a school' })
  @ApiCreatedResponse({ description: 'School created.', type: SchoolResponseDto })
  @ApiBadRequestResponse({ description: 'School details are invalid.' })
  @ApiConflictResponse({ description: 'A school with this code already exists.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateSchoolDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.create(actor, body);
  }

  @RequirePermission(PERMISSION.SCHOOL_READ)
  @Get()
  @ApiOperation({ summary: 'List schools' })
  @ApiOkResponse({ description: 'Paginated schools.', type: SchoolListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: SchoolListQueryDto,
  ): ReturnType<SchoolsService['findMany']> {
    return this.schools.findMany(actor, query);
  }

  @RequirePermission(PERMISSION.SCHOOL_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a school' })
  @ApiOkResponse({ description: 'School details.', type: SchoolResponseDto })
  @ApiNotFoundResponse({ description: 'School not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SchoolResponseDto> {
    return this.schools.findById(actor, id);
  }

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a school' })
  @ApiOkResponse({ description: 'School updated.', type: SchoolResponseDto })
  @ApiBadRequestResponse({ description: 'School details are invalid.' })
  @ApiNotFoundResponse({ description: 'School not found.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSchoolDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.update(actor, id, body);
  }

  @RequirePermission(PERMISSION.SCHOOL_MANAGE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a school status' })
  @ApiOkResponse({ description: 'School status updated.', type: SchoolResponseDto })
  @ApiBadRequestResponse({ description: 'Status is invalid.' })
  @ApiNotFoundResponse({ description: 'School not found.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSchoolStatusDto,
  ): Promise<SchoolResponseDto> {
    return this.schools.updateStatus(actor, id, body.status);
  }
}
