import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, Matches, Min, ValidateIf } from 'class-validator';
import { DATE_ONLY_PATTERN } from './date-only.js';

export class RenewSubscriptionDto {
  @ApiProperty({ format: 'date', example: '2027-06-30' })
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ format: 'date', example: '2027-07-01' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ minimum: 1, example: 10 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  maxDeliveries?: number;
}
