import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { PERMISSION } from '../auth/permissions.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { CreateSubscriptionDto } from './dto/create-subscription.dto.js';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto.js';
import { SubscriptionListQueryDto } from './dto/subscription-list-query.dto.js';
import { SubscriptionListResponseDto } from './dto/subscription-list-response.dto.js';
import { SubscriptionResponseDto } from './dto/subscription-response.dto.js';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';

@ApiTags('Subscriptions')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'Only platform staff with subscription.manage may use this API.',
})
@Controller({ path: 'subscriptions' })
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  // ─────────────────────────────────────────
  // POST /subscriptions — Grant a subscription
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Grant a course subscription to a school' })
  @ApiCreatedResponse({ description: 'Subscription granted.', type: SubscriptionResponseDto })
  @ApiBadRequestResponse({ description: 'Request data or date range is invalid.' })
  @ApiNotFoundResponse({ description: 'School or course not found.' })
  @ApiConflictResponse({ description: 'Course is inactive or subscription dates overlap.' })
  create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptions.create(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /subscriptions — List subscriptions
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Get()
  @ApiOperation({ summary: 'List subscriptions' })
  @ApiOkResponse({ description: 'Paginated subscriptions.', type: SubscriptionListResponseDto })
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: SubscriptionListQueryDto,
  ): Promise<SubscriptionListResponseDto> {
    return this.subscriptions.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /subscriptions/:id — Get a subscription
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription' })
  @ApiOkResponse({ description: 'Subscription details.', type: SubscriptionResponseDto })
  @ApiBadRequestResponse({ description: 'The subscription ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Subscription not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptions.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /subscriptions/:id — Update a subscription
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscription end date or delivery cap' })
  @ApiOkResponse({ description: 'Subscription updated.', type: SubscriptionResponseDto })
  @ApiBadRequestResponse({ description: 'The ID, body, or date range is invalid.' })
  @ApiNotFoundResponse({ description: 'Subscription not found.' })
  @ApiConflictResponse({
    description: 'The updated dates overlap or the delivery cap is below active deliveries.',
  })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptions.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // POST /subscriptions/:id/revoke — Revoke a subscription
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Post(':id/revoke')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a subscription' })
  @ApiNoContentResponse({ description: 'Subscription access revoked.' })
  @ApiBadRequestResponse({ description: 'The subscription ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Subscription not found.' })
  @ApiConflictResponse({ description: 'Subscription has already ended.' })
  revoke(@CurrentAuth() actor: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.subscriptions.revoke(actor, id);
  }

  // ─────────────────────────────────────────
  // POST /subscriptions/:id/renew — Renew a subscription
  // ─────────────────────────────────────────
  @RequirePermission(PERMISSION.SUBSCRIPTION_MANAGE)
  @Post(':id/renew')
  @ApiOperation({ summary: 'Renew a subscription with a new date range' })
  @ApiCreatedResponse({
    description: 'Renewed subscription created.',
    type: SubscriptionResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The ID, body, or date range is invalid.' })
  @ApiNotFoundResponse({ description: 'Subscription not found.' })
  @ApiConflictResponse({ description: 'Course is inactive or subscription dates overlap.' })
  renew(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenewSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptions.renew(actor, id, body);
  }
}
