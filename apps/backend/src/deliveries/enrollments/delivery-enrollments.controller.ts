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
import { DeliveryEnrollmentListQueryDto } from './dto/delivery-enrollment-list-query.dto.js';
import { DeliveryEnrollmentListResponseDto } from './dto/delivery-enrollment-response.dto.js';
import { EnrollDeliveryStudentsDto } from './dto/enroll-delivery-students.dto.js';
import { EnrollmentCountsResponseDto } from './dto/enrollment-counts-response.dto.js';
import { DeliveryEnrollmentsService } from './delivery-enrollments.service.js';

/** Provides enrollment writes and reads for deliveries. */
@ApiTags('Deliveries')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'Requires enrollment.manage; students and ungranted callers are denied.',
})
@Controller({ path: 'deliveries' })
export class DeliveryEnrollmentsController {
  constructor(private readonly deliveryEnrollments: DeliveryEnrollmentsService) {}

  // ─────────────────────────────────────────
  // POST /deliveries/:id/enrollments — Enroll students
  // ─────────────────────────────────────────

  /** Enrolls the supplied students after validating the full request. */
  @RequirePermission(PERMISSION.ENROLLMENT_MANAGE)
  @Post(':id/enrollments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enroll students in a delivery' })
  @ApiOkResponse({ description: 'Enrollment counts.', type: EnrollmentCountsResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID or student IDs are invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery or one or more students not found.' })
  @ApiConflictResponse({
    description: 'DELIVERY_NOT_ACTIVE, STUDENT_NOT_ACTIVE, or STUDENT_WRONG_CLASS.',
  })
  enroll(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EnrollDeliveryStudentsDto,
  ): Promise<EnrollmentCountsResponseDto> {
    return this.deliveryEnrollments.enroll(actor, id, body.studentIds);
  }

  // ─────────────────────────────────────────
  // POST /deliveries/:id/enrollments/class — Enroll a class
  // ─────────────────────────────────────────

  /** Enrolls every active student currently in the delivery's class section. */
  @RequirePermission(PERMISSION.ENROLLMENT_MANAGE)
  @Post(':id/enrollments/class')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enroll the active students in a delivery class' })
  @ApiOkResponse({ description: 'Enrollment counts.', type: EnrollmentCountsResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found.' })
  @ApiConflictResponse({ description: 'DELIVERY_NOT_ACTIVE.' })
  enrollClass(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnrollmentCountsResponseDto> {
    return this.deliveryEnrollments.enrollClass(actor, id);
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id/enrollments — List enrollments
  // ─────────────────────────────────────────

  /** Lists delivery enrollments, defaulting to all statuses and sorting newest first. */
  @RequirePermission(PERMISSION.ENROLLMENT_MANAGE)
  @Get(':id/enrollments')
  @ApiOperation({ summary: 'List delivery enrollments' })
  @ApiOkResponse({
    description: 'Paginated enrollment list.',
    type: DeliveryEnrollmentListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The delivery ID or query is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found.' })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeliveryEnrollmentListQueryDto,
  ): Promise<DeliveryEnrollmentListResponseDto> {
    return this.deliveryEnrollments.findMany(actor, id, query);
  }

  // ─────────────────────────────────────────
  // DELETE /deliveries/:id/enrollments/:studentId — Remove an enrollment
  // ─────────────────────────────────────────

  /** Removes one active enrollment without deleting its record. */
  @RequirePermission(PERMISSION.ENROLLMENT_MANAGE)
  @Delete(':id/enrollments/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a student from a delivery' })
  @ApiNoContentResponse({ description: 'Enrollment removed or already removed.' })
  @ApiBadRequestResponse({ description: 'The delivery or student ID is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery or enrollment not found.' })
  @ApiConflictResponse({
    description:
      'ENROLLMENT_NOT_ACTIVE: completed enrollments cannot be removed. Already-REMOVED enrollments return 204.',
  })
  async remove(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ): Promise<void> {
    await this.deliveryEnrollments.remove(actor, id, studentId);
  }
}
