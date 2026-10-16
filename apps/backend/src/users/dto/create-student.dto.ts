import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateStudentDto {
  @ApiProperty({ maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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
