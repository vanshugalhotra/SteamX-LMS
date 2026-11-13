/** Validated answer payload for submitting or replacing a student's assignment submission. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ASSIGNMENT_LIMITS } from '../../../assignments/blueprint/constants.js';

export class StudentSubmissionAnswerRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.text.maxLength })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.text.maxLength)
  answerText?: string;
}

export class StudentSubmissionRequestDto {
  @ApiProperty({ type: [StudentSubmissionAnswerRequestDto], maxItems: ASSIGNMENT_LIMITS.maxItems })
  @IsArray()
  @ArrayMaxSize(ASSIGNMENT_LIMITS.maxItems)
  @ValidateNested({ each: true })
  @Type(() => StudentSubmissionAnswerRequestDto)
  answers!: StudentSubmissionAnswerRequestDto[];
}
