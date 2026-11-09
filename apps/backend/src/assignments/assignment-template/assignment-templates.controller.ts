/** HTTP and permission boundary for platform-managed assignment templates. */
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
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../../auth/permissions.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import {
  AssignmentTemplateListQueryDto,
  AssignmentTemplateListResponseDto,
  AssignmentTemplateSummaryDto,
  AssignmentTemplateResponseDto,
  CreateAssignmentTemplateDto,
  UpdateAssignmentTemplateDto,
  UpdateAssignmentTemplateStatusDto,
} from './dto/assignment-template.dto.js';
import { AssignmentTemplatesService } from './assignment-templates.service.js';

@ApiTags('Assignment templates')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'Only platform admins with assignment.template.manage may use this API.',
})
@Controller({ path: 'assignment-templates' })
export class AssignmentTemplatesController {
  constructor(private readonly templates: AssignmentTemplatesService) {}

  // ─────────────────────────────────────────
  // POST /assignment-templates — Create a template
  // ─────────────────────────────────────────

  /** Creates a draft template after checking its course and optional anchor. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create an assignment template' })
  @ApiCreatedResponse({
    description: 'Draft assignment template created.',
    type: AssignmentTemplateSummaryDto,
  })
  @ApiBadRequestResponse({ description: 'Template fields or blueprint shape are invalid.' })
  @ApiNotFoundResponse({ description: 'Course or anchor not found in the selected course.' })
  @ApiConflictResponse({ description: 'The course is archived.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateAssignmentTemplateDto,
  ): Promise<AssignmentTemplateSummaryDto> {
    return this.templates.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /assignment-templates — List templates
  // ─────────────────────────────────────────

  /** Lists paginated summaries without exposing blueprint answer keys. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Get()
  @ApiOperation({ summary: 'List assignment templates' })
  @ApiOkResponse({
    description: 'Paginated template summaries; blueprint is omitted.',
    type: AssignmentTemplateListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Query filters or pagination are invalid.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: AssignmentTemplateListQueryDto,
  ): Promise<AssignmentTemplateListResponseDto> {
    return this.templates.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /assignment-templates/:id — Get a template
  // ─────────────────────────────────────────

  /** Returns a template and its full blueprint, including answer keys. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Get(':id')
  @ApiOperation({ summary: 'Get an assignment template' })
  @ApiOkResponse({
    description: 'Template details, including blueprint answer keys.',
    type: AssignmentTemplateResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The template ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Template not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentTemplateResponseDto> {
    return this.templates.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /assignment-templates/:id — Update a template
  // ─────────────────────────────────────────

  /** Updates template fields without changing the course or anchor. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an assignment template' })
  @ApiOkResponse({ description: 'Template updated.', type: AssignmentTemplateSummaryDto })
  @ApiBadRequestResponse({ description: 'The template ID, patch, or blueprint shape is invalid.' })
  @ApiNotFoundResponse({ description: 'Template not found.' })
  @ApiConflictResponse({
    description: 'Archived templates are read-only or active blueprint is invalid.',
  })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssignmentTemplateDto,
  ): Promise<AssignmentTemplateSummaryDto> {
    return this.templates.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /assignment-templates/:id/status — Change status
  // ─────────────────────────────────────────

  /** Changes template lifecycle status; activation checks the complete blueprint rules. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Change assignment template status' })
  @ApiOkResponse({ description: 'Template status changed.', type: AssignmentTemplateSummaryDto })
  @ApiBadRequestResponse({ description: 'The template ID or status is invalid.' })
  @ApiNotFoundResponse({ description: 'Template not found.' })
  @ApiConflictResponse({
    description: 'The blueprint is incomplete or the status transition is invalid.',
  })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssignmentTemplateStatusDto,
  ): Promise<AssignmentTemplateSummaryDto> {
    return this.templates.updateStatus(actor, id, body.status);
  }

  // ─────────────────────────────────────────
  // DELETE /assignment-templates/:id — Delete an unused template
  // ─────────────────────────────────────────

  /** Deletes an unused template; copies keep their source-template reference. */
  @RequirePermission(PERMISSION.ASSIGNMENT_TEMPLATE_MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused assignment template' })
  @ApiNoContentResponse({ description: 'Template deleted.' })
  @ApiBadRequestResponse({ description: 'The template ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Template not found.' })
  @ApiConflictResponse({ description: 'The template is referenced by an assignment copy.' })
  async delete(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.templates.delete(actor, id);
  }
}
