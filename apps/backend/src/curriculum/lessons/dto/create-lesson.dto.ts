import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { LessonAudience } from '../../../generated/prisma/client.js';

export class CreateLessonDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ enum: LessonAudience, default: LessonAudience.TEACHER_ONLY })
  @IsOptional()
  @IsEnum(LessonAudience)
  audience?: LessonAudience;
}
