import { ApiProperty } from '@nestjs/swagger';
import { ContentStatus } from '../../../generated/prisma/client.js';

export class CourseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ nullable: true, maxLength: 2000 })
  description!: string | null;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
