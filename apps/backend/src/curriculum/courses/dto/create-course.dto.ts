import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, IsOptional } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateCourseDto {
  @ApiProperty({ maxLength: 200 })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
