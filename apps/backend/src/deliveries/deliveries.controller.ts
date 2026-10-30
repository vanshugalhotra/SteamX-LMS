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
import { PERMISSION } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { CreateDeliveryDto } from './dto/create-delivery.dto.js';
import { DeliveryListQueryDto } from './dto/delivery-list-query.dto.js';
import { DeliveryListResponseDto } from './dto/delivery-list-response.dto.js';
import { DeliveryResponseDto } from './dto/delivery-response.dto.js';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto.js';
import { DeliveriesService } from './deliveries.service.js';

/**
 * Exposes delivery creation, scoped reads, and status changes.
 * Permission and request validation run before delivery service rules.
 */
@ApiTags('Deliveries')
@ApiProtectedController()
@ApiForbiddenResponse({ description: 'The required permission is missing.' })
@Controller({ path: 'deliveries' })
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  // ─────────────────────────────────────────
  // POST /deliveries — Create a delivery
  // ─────────────────────────────────────────
  /**
   * Creates an ACTIVE delivery in an active school.
   * @param actor Authenticated actor with delivery.manage.
   * @param body School, course, class-section, and academic year.
   * @returns The created delivery with derived fields.
   * @throws NotFoundException for out-of-scope records; ConflictException for inactive course, duplicate, or cap; ForbiddenException without current access.
   */
  @RequirePermission(PERMISSION.DELIVERY_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a delivery' })
  @ApiCreatedResponse({ description: 'Delivery created.', type: DeliveryResponseDto })
  @ApiBadRequestResponse({ description: 'Delivery details are invalid.' })
  @ApiNotFoundResponse({ description: 'School, class section, or course not found.' })
  @ApiConflictResponse({
    description: 'Course is inactive, delivery limit is reached, or delivery already exists.',
  })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateDeliveryDto,
  ): Promise<DeliveryResponseDto> {
    return this.deliveries.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /deliveries — List deliveries
  // ─────────────────────────────────────────
  /**
   * Lists visible deliveries; teachers see their active assignments.
   * @param actor Authenticated actor with delivery.read.
   * @param query Scope, filters, and page settings.
   * @returns A paginated delivery response.
   */
  @RequirePermission(PERMISSION.DELIVERY_READ)
  @Get()
  @ApiOperation({ summary: 'List deliveries' })
  @ApiOkResponse({ description: 'Paginated deliveries.', type: DeliveryListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: DeliveryListQueryDto,
  ): Promise<DeliveryListResponseDto> {
    return this.deliveries.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id — Get a delivery
  // ─────────────────────────────────────────
  /**
   * Reads a visible delivery.
   * @param actor Authenticated actor with delivery.read.
   * @param id Delivery UUID.
   * @returns The delivery with current subscription state.
   * @throws NotFoundException for missing, foreign, or unassigned teacher records.
   */
  @RequirePermission(PERMISSION.DELIVERY_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery' })
  @ApiOkResponse({ description: 'Delivery details.', type: DeliveryResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryResponseDto> {
    return this.deliveries.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /deliveries/:id/status — Change delivery status
  // ─────────────────────────────────────────
  /**
   * Changes delivery status.
   * @param actor Authenticated actor with delivery.manage.
   * @param id Delivery UUID.
   * @param body Target delivery status.
   * @returns The updated delivery with current subscription state.
   * @throws NotFoundException if missing; ConflictException for inactive course or cap; ForbiddenException without current access.
   */
  @RequirePermission(PERMISSION.DELIVERY_MANAGE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Change delivery status' })
  @ApiOkResponse({ description: 'Delivery status updated.', type: DeliveryResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID or status is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found.' })
  @ApiConflictResponse({
    description: 'Course is inactive or the delivery limit is reached.',
  })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDeliveryStatusDto,
  ): Promise<DeliveryResponseDto> {
    return this.deliveries.updateStatus(actor, id, body);
  }
}
