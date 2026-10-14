/**
 * Validates class-section fields accepted when creating a section.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateClassSectionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiProperty({ maxLength: 50 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  className!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @Trim()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sectionName?: string;
}
