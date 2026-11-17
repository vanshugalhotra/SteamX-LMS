import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
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
import { StudentAssignmentGradesResponseDto } from './dto/student-assignment-grades-response.dto.js';
import { StudentAssignmentsService } from './student-assignments.service.js';

@ApiTags('Learning assignments')
@ApiProtectedController()
@RequirePermission(PERMISSION.LEARNING_READ)
@ApiForbiddenResponse({
  description: 'The caller must be a student with learning.read and an active subscription.',
})
@Controller({ path: 'learning/deliveries/:id' })
export class StudentAssignmentGradesController {
  constructor(private readonly assignments: StudentAssignmentsService) {}

  // ─────────────────────────────────────────
  // GET /learning/deliveries/:id/grades — Get student grades
  // ─────────────────────────────────────────
  /** Lists the authenticated student's graded assignments for one delivery. */
  @Get('grades')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: "Get a student's grades for a delivery",
    description:
      'Returns graded submissions for visible PUBLISHED assignments, ordered by gradedAt descending. The result is not paginated; its size is bounded by the number of assignments in this delivery. The average is an equal-weight mean rounded by the grade scale.',
  })
  @ApiOkResponse({ type: StudentAssignmentGradesResponseDto })
  @ApiBadRequestResponse({ description: 'The delivery ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Delivery not found or not visible to the student.' })
  findGrades(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) deliveryId: string,
  ): Promise<StudentAssignmentGradesResponseDto> {
    return this.assignments.findGrades(auth, deliveryId);
  }
}
