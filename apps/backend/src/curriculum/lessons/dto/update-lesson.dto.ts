import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { LessonAudience } from '../../../generated/prisma/client.js';

export class UpdateLessonDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: LessonAudience })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(LessonAudience)
  audience?: LessonAudience;
}
