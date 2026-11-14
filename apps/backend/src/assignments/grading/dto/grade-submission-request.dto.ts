/** Validates a teacher's complete grade replacement request. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { ASSIGNMENT_LIMITS } from '../../blueprint/constants.js';
import { IsArray, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class GradeSubmissionRequestDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Echo the submittedAt value from the submission detail response exactly.',
  })
  @IsString()
  @IsNotEmpty()
  submittedAt!: string;

  @ApiPropertyOptional({ description: 'Required only when the assignment has no rubric.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  level?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required only when the assignment has a rubric; one level per category.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  rubricLevels?: string[];

  @ApiPropertyOptional({
    type: String,
    maxLength: ASSIGNMENT_LIMITS.feedbackMaxLength,
    nullable: true,
    description: 'Plain text overall feedback; whitespace-only feedback is stored as null.',
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.feedbackMaxLength)
  feedback?: string | null;
}
