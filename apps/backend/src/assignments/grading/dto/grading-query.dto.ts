/** Validates submission-list state and pagination filters. */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';
import {
  STUDENT_SUBMISSION_STATE,
  type StudentSubmissionState,
} from '../../../learning/assignments/assignment-student-rules.js';

export class GradingQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(STUDENT_SUBMISSION_STATE) })
  @IsOptional()
  @IsEnum(STUDENT_SUBMISSION_STATE)
  state?: StudentSubmissionState;
}
