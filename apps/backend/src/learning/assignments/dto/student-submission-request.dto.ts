/** Validated answer payload for submitting or replacing a student's assignment submission. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, IsUUID, ValidateIf, ValidateNested } from 'class-validator';

export class StudentSubmissionAnswerRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  selectedOptionId?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  answerText?: string;
}

export class StudentSubmissionRequestDto {
  @ApiProperty({ type: [StudentSubmissionAnswerRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentSubmissionAnswerRequestDto)
  answers!: StudentSubmissionAnswerRequestDto[];
}
