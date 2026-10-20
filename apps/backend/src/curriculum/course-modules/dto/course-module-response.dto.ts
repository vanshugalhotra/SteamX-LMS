import { ApiProperty } from '@nestjs/swagger';
import { ContentStatus } from '../../../generated/prisma/client.js';

export class CourseModuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
