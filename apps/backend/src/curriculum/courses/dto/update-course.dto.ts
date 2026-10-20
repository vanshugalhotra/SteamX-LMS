import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateCourseDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @Trim()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
