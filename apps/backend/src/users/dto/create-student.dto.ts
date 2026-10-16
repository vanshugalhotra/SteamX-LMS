import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PasswordInput } from '../../common/decorators/password-input.decorator.js';
import {
  MAX_PASSWORD_CHARACTERS,
  MIN_PASSWORD_CHARACTERS,
} from '../../auth/validators/password-policy.js';

export class CreateStudentDto {
  @ApiProperty({ maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @PasswordInput({
    minLength: MIN_PASSWORD_CHARACTERS,
    maxLength: MAX_PASSWORD_CHARACTERS,
  })
  password!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classSectionId!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
