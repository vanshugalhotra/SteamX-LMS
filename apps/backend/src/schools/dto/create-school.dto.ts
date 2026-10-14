import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateSchoolDto {
  @ApiProperty({ example: 'AB-12', minLength: 2, maxLength: 32 })
  @Trim()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/)
  code!: string;

  @ApiProperty({ example: 'DAV School', maxLength: 120 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Kotkapura', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'Punjab', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiProperty({ example: '151204', maxLength: 20 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ example: 'India', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country!: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  streetAddress?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactName?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  contactPhone?: string | null;

  @ApiPropertyOptional({ maxLength: 254, nullable: true })
  @Trim({ lowercase: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string | null;
}
