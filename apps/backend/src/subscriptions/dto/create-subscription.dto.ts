import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsUUID, Matches, Min } from 'class-validator';
import { DATE_ONLY_PATTERN } from './date-only.js';

export class CreateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;

  @ApiProperty({ format: 'date', example: '2026-11-01' })
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ format: 'date', example: '2027-06-30' })
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiProperty({ minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  maxDeliveries!: number;
}
