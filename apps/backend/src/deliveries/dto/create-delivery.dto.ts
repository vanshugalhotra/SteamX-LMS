import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

export class CreateDeliveryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  classSectionId!: string;

  @ApiProperty({ example: '2026-27', pattern: '^\\d{4}-\\d{2}$' })
  @Matches(/^\d{4}-\d{2}$/)
  academicYear!: string;
}
