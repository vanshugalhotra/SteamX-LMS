import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 254, nullable: true })
  @IsOptional()
  @Trim({ lowercase: true })
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  primaryAssignment?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  guardianName?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  classSectionId?: string;
}
