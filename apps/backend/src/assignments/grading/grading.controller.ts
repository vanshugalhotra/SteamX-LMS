/** Exposes delivery-scoped teacher review and grading endpoints. */
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../../auth/permissions.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { ApiProtectedController } from '../../common/decorators/api-protected-controller.decorator.js';
import { GradeSubmissionRequestDto } from './dto/grade-submission-request.dto.js';
import { GradingQueryDto } from './dto/grading-query.dto.js';
import {
  TeacherSubmissionDetailResponseDto,
  TeacherSubmissionListResponseDto,
} from './dto/grading-response.dto.js';
import { GradingService } from './grading.service.js';

/** Provides cache-private teacher access to assignment submission states and work. */
@ApiTags('Assignment grading')
@ApiProtectedController()
@RequirePermission(PERMISSION.SUBMISSION_GRADE)
@ApiForbiddenResponse({
  description: 'Requires submission.grade; students and platform staff are denied.',
})
@ApiUnauthorizedResponse({ description: 'Authentication is required.' })
@Controller({ path: 'deliveries/:id/assignments/:assignmentId/submissions' })
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  // ─────────────────────────────────────────
  // GET /deliveries/:id/assignments/:assignmentId/submissions — List submissions
  // ─────────────────────────────────────────

  /** Lists each active enrollment and its submission state for the assignment. */
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'List assignment submissions for teacher review',
    description:
      'Returns one row per ACTIVE delivery enrollment. NOT_SUBMITTED isLate predicts lateness if the student submitted now.',
  })
  @ApiOkResponse({ type: TeacherSubmissionListResponseDto })
  @ApiBadRequestResponse({
    description: 'The IDs, state filter, or pagination values are invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Delivery is not assigned to the teacher or assignment is outside it.',
  })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Query() query: GradingQueryDto,
  ): Promise<TeacherSubmissionListResponseDto> {
    return this.grading.findMany(actor, deliveryId, assignmentId, query);
  }

  // ─────────────────────────────────────────
  // GET /deliveries/:id/assignments/:assignmentId/submissions/:submissionId — Read submission
  // ─────────────────────────────────────────

  /** Reads student-safe assignment content, one submission, and any current grade. */
  @Get(':submissionId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read one assignment submission',
    description:
      'Options include text only, never correctness. submittedAt is returned with milliseconds and must be echoed exactly when grading. File data is metadata only.',
  })
  @ApiOkResponse({ type: TeacherSubmissionDetailResponseDto })
  @ApiBadRequestResponse({ description: 'A supplied ID is not a UUID.' })
  @ApiNotFoundResponse({
    description: 'Delivery, assignment, or submission is outside teacher scope.',
  })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ): Promise<TeacherSubmissionDetailResponseDto> {
    return this.grading.findById(actor, deliveryId, assignmentId, submissionId);
  }

  // ─────────────────────────────────────────
  // PUT /deliveries/:id/assignments/:assignmentId/submissions/:submissionId/grade — Grade submission
  // ─────────────────────────────────────────

  /** Replaces a submission grade after validating mode and the echoed submission timestamp. */
  @Put(':submissionId/grade')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Grade or regrade an assignment submission',
    description:
      'Mode is derived from the assignment: rubric assignments require rubricLevels; non-rubric non-MCQ assignments require level; all-MCQ assignments are auto-graded only. Echo submittedAt from the detail response exactly. Regrading overwrites the existing grade.',
  })
  @ApiOkResponse({ type: TeacherSubmissionDetailResponseDto })
  @ApiBadRequestResponse({ description: 'The request shape, UUID, or unknown field is invalid.' })
  @ApiUnprocessableEntityResponse({
    description: 'SUBMISSION_GRADE_INVALID with all mode-specific field and rule details.',
  })
  @ApiConflictResponse({
    description: 'ASSIGNMENT_AUTO_GRADED, SUBMISSION_CHANGED, or DELIVERY_NOT_ACTIVE.',
  })
  @ApiForbiddenResponse({
    description:
      'Requires submission.grade; SUBSCRIPTION_EXPIRED when the delivery subscription is inactive.',
  })
  @ApiNotFoundResponse({
    description: 'Delivery, assignment, or submission is outside teacher scope.',
  })
  grade(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() body: GradeSubmissionRequestDto,
  ): Promise<TeacherSubmissionDetailResponseDto> {
    return this.grading.grade(actor, deliveryId, assignmentId, submissionId, body);
  }
}
