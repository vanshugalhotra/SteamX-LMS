/** Exposes assignment defaults to authenticated API clients. */
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly } from '../auth/decorators/authenticated-only.decorator.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { AssignmentDefaultsResponseDto } from './dto/assignment-defaults-response.dto.js';
import { AssignmentsService } from './assignments.service.js';

@ApiTags('Assignments')
@ApiProtectedController()
@Controller({ path: 'assignments' })
export class AssignmentsController {
  /** Injects assignment rules and defaults. */
  constructor(private readonly assignments: AssignmentsService) {}

  // ─────────────────────────────────────────
  // GET /assignments/defaults — Read shared defaults
  // ─────────────────────────────────────────

  /** Returns the server-owned rubric, grade levels, and limits. */
  @AuthenticatedOnly()
  @Get('defaults')
  @ApiOperation({ summary: 'Get assignment defaults' })
  @ApiOkResponse({
    description: 'Static assignment defaults for authenticated clients.',
    type: AssignmentDefaultsResponseDto,
  })
  getDefaults(): AssignmentDefaultsResponseDto {
    return this.assignments.getDefaults();
  }
}
