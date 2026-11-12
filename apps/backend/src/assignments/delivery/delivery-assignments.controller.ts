/** Exposes teacher-managed assignment operations within a visible delivery. */
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
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../../auth/permissions.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { AssignmentPublishingService } from './assignment-publishing.service.js';
import { AssignmentTemplateCopyService } from './assignment-template-copy.service.js';
import { DeliveryAssignmentEditsService } from './delivery-assignment-edits.service.js';
import {
  CreateDeliveryAssignmentDto,
  CreateDeliveryAssignmentFromTemplateDto,
  DeliveryAssignmentListQueryDto,
  UpdateDeliveryAssignmentDto,
} from '../dto/delivery-assignment-request.dto.js';
import {
  DeliveryAssignmentListResponseDto,
  DeliveryAssignmentResponseDto,
} from '../dto/delivery-assignment-response.dto.js';
import { DeliveryAssignmentsService } from './delivery-assignments.service.js';

/** Provides delivery-scoped CRUD and lifecycle operations for assignments. */
@ApiTags('Assignments')
@ApiProtectedController()
@RequirePermission(PERMISSION.ASSIGNMENT_MANAGE)
@ApiForbiddenResponse({
  description: 'Requires assignment.manage; platform staff and students are denied.',
})
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@Controller({ path: 'deliveries/:id/assignments' })
export class DeliveryAssignmentsController {
  constructor(
    private readonly assignments: DeliveryAssignmentsService,
    private readonly templateCopies: AssignmentTemplateCopyService,
    private readonly edits: DeliveryAssignmentEditsService,
    private readonly publishing: AssignmentPublishingService,
  ) {}

  /** Creates an incomplete-capable DRAFT assignment from a teacher-supplied blueprint. */
  @Post()
  @ApiOperation({ summary: 'Create a delivery assignment draft' })
  @ApiCreatedResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The request shape or UUID is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery or anchor is not visible in the delivery course.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE.' })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Body() body: CreateDeliveryAssignmentDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.assignments.create(actor, deliveryId, body);
  }

  /** Creates a DRAFT copy of an ACTIVE template in the delivery course. */
  @Post('from-template')
  @ApiOperation({ summary: 'Create a delivery assignment from a template' })
  @ApiCreatedResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The request shape or rubric override is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery or active same-course template not found.' })
  @ApiConflictResponse({
    description: 'DELIVERY_NOT_ACTIVE or TEMPLATE_ALREADY_PUBLISHED_TO_DELIVERY.',
  })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  createFromTemplate(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Body() body: CreateDeliveryAssignmentFromTemplateDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.templateCopies.create(actor, deliveryId, body);
  }

  /** Lists paginated assignment summaries without item or option content. */
  @Get()
  @ApiOperation({ summary: 'List assignments for a delivery' })
  @ApiOkResponse({ type: DeliveryAssignmentListResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID or pagination filter is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found or not assigned to the teacher.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Query() query: DeliveryAssignmentListQueryDto,
  ) {
    return this.assignments.findMany(actor, deliveryId, query);
  }

  /** Reads the full assignment and omits template-copy answer keys. */
  @Get(':assignmentId')
  @ApiOperation({ summary: 'Get assignment details' })
  @ApiOkResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery or assignment ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment not found in the delivery.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.assignments.findById(actor, deliveryId, assignmentId);
  }

  /** Applies metadata changes and replaces editable content as a whole. */
  @Patch(':assignmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit a delivery assignment',
    description:
      'Replacing items deletes and recreates all item and option rows, so item IDs change.',
  })
  @ApiOkResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The request shape or assignment ID is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment not found in the delivery.' })
  @ApiConflictResponse({
    description: 'DELIVERY_NOT_ACTIVE, ASSIGNMENT_CONTENT_LOCKED, or ASSIGNMENT_DUE_DATE_REQUIRED.',
  })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: UpdateDeliveryAssignmentDto,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.edits.update(actor, deliveryId, assignmentId, body);
  }

  /** Publishes a complete assignment; retries preserve its first publishedAt timestamp. */
  @Post(':assignmentId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish an assignment' })
  @ApiOkResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery or assignment ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment not found in the delivery.' })
  @ApiConflictResponse({
    description:
      'DELIVERY_NOT_ACTIVE, ASSIGNMENT_DUE_DATE_REQUIRED, ASSIGNMENT_BLUEPRINT_INVALID, or ASSIGNMENT_LESSON_NOT_STUDENT_FACING.',
  })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  publish(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.publishing.publish(actor, deliveryId, assignmentId);
  }

  /** Unpublishes an assignment without clearing its original publish timestamp. */
  @Post(':assignmentId/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish an assignment' })
  @ApiOkResponse({ type: DeliveryAssignmentResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery or assignment ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment not found in the delivery.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE or ASSIGNMENT_UNPUBLISHED_FROM_DRAFT.' })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  unpublish(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.publishing.unpublish(actor, deliveryId, assignmentId);
  }

  /** Deletes an assignment only when it has no submissions. */
  @Delete(':assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unused assignment' })
  @ApiNoContentResponse({ description: 'The assignment and its items were deleted.' })
  @ApiBadRequestResponse({ description: 'The delivery or assignment ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment not found in the delivery.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE or ASSIGNMENT_HAS_SUBMISSIONS.' })
  @ApiForbiddenResponse({ description: 'Permission denied or SUBSCRIPTION_EXPIRED.' })
  async delete(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<void> {
    await this.edits.delete(actor, deliveryId, assignmentId);
  }
}
