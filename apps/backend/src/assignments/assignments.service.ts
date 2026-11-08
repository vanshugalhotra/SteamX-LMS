/** Applies assignment rules and assembles responses for assignment endpoints. */
import { Injectable } from '@nestjs/common';
import type { AssignmentDefaultsResponseDto } from './dto/assignment-defaults-response.dto.js';
import { toAssignmentDefaultsResponse } from './assignments.mapper.js';

@Injectable()
export class AssignmentsService {
  /** Returns shared rubric, grade-level, and blueprint defaults. */
  getDefaults(): AssignmentDefaultsResponseDto {
    return toAssignmentDefaultsResponse();
  }
}
