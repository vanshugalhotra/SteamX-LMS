import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateCourseDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
