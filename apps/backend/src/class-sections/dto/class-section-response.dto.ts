/**
 * Describes the fields returned for one class section.
 */
import { ApiProperty } from '@nestjs/swagger';

export class ClassSectionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  schoolId!: string;

  @ApiProperty({ maxLength: 50 })
  className!: string;

  @ApiProperty({ maxLength: 50 })
  sectionName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
