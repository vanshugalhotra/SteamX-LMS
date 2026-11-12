/** Validates paging and anchor/state filters for student assignment lists. */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';
import {
  STUDENT_SUBMISSION_STATE,
  type StudentSubmissionState,
} from '../assignment-student-rules.js';

export class StudentAssignmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(STUDENT_SUBMISSION_STATE),
    description: 'Filters using this student’s own submission only.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(STUDENT_SUBMISSION_STATE)
  state?: StudentSubmissionState;

  @ApiPropertyOptional({ format: 'uuid', description: 'Matches the lesson anchor exactly.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Matches the module anchor exactly.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  moduleId?: string;
}
