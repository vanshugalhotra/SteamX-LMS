import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CreateDeliveryTeacherDto } from './dto/create-delivery-teacher.dto.js';
import { DeliveryTeacherListQueryDto } from './dto/delivery-teacher-list-query.dto.js';
import { DeliveryTeacherListResponseDto } from './dto/delivery-teacher-response.dto.js';
import { DeliveryTeacherResponseDto } from './dto/delivery-teacher-response.dto.js';
import { DeliveryTeachersService } from './delivery-teachers.service.js';

/**
 * Exposes administrator-only assignment history and management for delivery teachers.
 */
@ApiTags('Deliveries')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'Requires delivery.manage; teachers and students are denied.',
})
@Controller({ path: 'deliveries' })
export class DeliveryTeachersController {
  constructor(private readonly deliveryTeachers: DeliveryTeachersService) {}

  // ─────────────────────────────────────────
  // POST /deliveries/:id/teachers — Assign a teacher
  // ─────────────────────────────────────────
  /**
   * Assigns a teacher to an active delivery.
   * @param actor Authenticated administrator.
   * @param id Delivery UUID.
   * @param body Teacher UUID.
   * @returns The created assignment.
   */
  @RequirePermission(PERMISSION.DELIVERY_MANAGE)
  @Post(':id/teachers')
  @ApiOperation({ summary: 'Assign a teacher to a delivery' })
  @ApiCreatedResponse({ description: 'Teacher assigned.', type: DeliveryTeacherResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID, teacher ID, or body is invalid.' })
  @ApiNotFoundResponse({
    description: 'Delivery or teacher profile in the delivery school not found (NOT_FOUND).',
  })
  @ApiConflictResponse({
    description: 'DELIVERY_NOT_ACTIVE, TEACHER_NOT_ACTIVE, or TEACHER_ALREADY_ASSIGNED.',
  })
  assign(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateDeliveryTeacherDto,
  ): Promise<DeliveryTeacherResponseDto> {
    return this.deliveryTeachers.assign(actor, id, body);
  }

  // ─────────────────────────────────────────
  // DELETE /deliveries/:id/teachers/:teacherId — Remove a teacher
  // ─────────────────────────────────────────
  /**
   * Ends the active teacher assignment without deleting its history record.
   * @param actor Authenticated administrator.
   * @param id Delivery UUID.
   * @param teacherId Teacher UUID.
   */
  @RequirePermission(PERMISSION.DELIVERY_MANAGE)
  @Delete(':id/teachers/:teacherId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a teacher from a delivery' })
  @ApiNoContentResponse({ description: 'The active assignment was removed.' })
  @ApiBadRequestResponse({ description: 'The delivery or teacher ID is invalid.' })
  @ApiNotFoundResponse({
    description: 'No active assignment exists in scope (TEACHER_NOT_ASSIGNED).',
  })
  remove(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
  ): Promise<void> {
    return this.deliveryTeachers.remove(actor, id, teacherId);
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id/teachers — List teachers
  // ─────────────────────────────────────────
  /**
   * Lists active assignments or the full assignment history for a delivery.
   * @param actor Authenticated administrator.
   * @param id Delivery UUID.
   * @param query Page and removed-history options.
   * @returns Paginated assignment history.
   */
  @RequirePermission(PERMISSION.DELIVERY_MANAGE)
  @Get(':id/teachers')
  @ApiOperation({ summary: 'List delivery teachers' })
  @ApiOkResponse({
    description: 'Paginated teacher assignments.',
    type: DeliveryTeacherListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery ID or query is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found (NOT_FOUND).' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeliveryTeacherListQueryDto,
  ): Promise<DeliveryTeacherListResponseDto> {
    return this.deliveryTeachers.findMany(actor, id, query);
  }
}
