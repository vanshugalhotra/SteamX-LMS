/** Exposes private student assignment reads under an enrolled delivery. */
import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
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
import { StudentAssignmentListQueryDto } from './dto/student-assignment-list-query.dto.js';
import {
  StudentAssignmentDetailResponseDto,
  StudentAssignmentListResponseDto,
} from './dto/student-assignment-response.dto.js';
import { StudentAssignmentsService } from './student-assignments.service.js';

@ApiTags('Learning assignments')
@ApiProtectedController()
@RequirePermission(PERMISSION.LEARNING_READ)
@ApiForbiddenResponse({
  description: 'The caller must be a student with learning.read and an active subscription.',
})
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@Controller({ path: 'learning/deliveries/:id/assignments' })
export class StudentAssignmentsController {
  constructor(private readonly assignments: StudentAssignmentsService) {}

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/assignments — List student assignments
  // ─────────────────────────────────────────
  /** Lists the authenticated student's published assignments in a visible delivery. */
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: "List a student's assignments for a delivery",
    description:
      'Only PUBLISHED assignments are listed. Course-level and module-anchored assignments are visible; a lesson anchor must be an ACTIVE or ARCHIVED STUDENT lesson released to this delivery. For a not-submitted assignment, isLate means a submission made now would be late. canSubmit is true when no submission exists or resubmission is enabled.',
  })
  @ApiOkResponse({ type: StudentAssignmentListResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID or list query is invalid.' })
  @ApiNotFoundResponse({ description: 'Delivery not found or assignment is not visible.' })
  findMany(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Query() query: StudentAssignmentListQueryDto,
  ): Promise<StudentAssignmentListResponseDto> {
    return this.assignments.findMany(auth, deliveryId, query);
  }

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/assignments/:assignmentId — Read assignment
  // ─────────────────────────────────────────
  /** Reads student-safe assignment content and only the authenticated student's submission. */
  @Get(':assignmentId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: "Read a student's assignment",
    description:
      'Only PUBLISHED assignments are visible. Course-level and module-anchored assignments are visible; a lesson anchor must be an ACTIVE or ARCHIVED STUDENT lesson released to this delivery. For a not-submitted assignment, isLate means a submission made now would be late. canSubmit is true when no submission exists or resubmission is enabled. Correctness, answer keys, file storage details, and teacher information are omitted.',
  })
  @ApiOkResponse({ type: StudentAssignmentDetailResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery or assignment ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery or assignment is not visible.' })
  findById(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<StudentAssignmentDetailResponseDto> {
    return this.assignments.findById(auth, deliveryId, assignmentId);
  }
}
