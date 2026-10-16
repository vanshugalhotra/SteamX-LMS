import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PasswordInput } from '../../common/decorators/password-input.decorator.js';
import {
  MAX_PASSWORD_CHARACTERS,
  MIN_PASSWORD_CHARACTERS,
} from '../../auth/validators/password-policy.js';

export class CreateTeacherDto {
  @ApiProperty({ maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 254, nullable: true })
  @Trim({ lowercase: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @PasswordInput({
    minLength: MIN_PASSWORD_CHARACTERS,
    maxLength: MAX_PASSWORD_CHARACTERS,
  })
  password!: string;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  primaryAssignment?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
