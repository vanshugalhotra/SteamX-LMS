import { ApiProperty } from '@nestjs/swagger';
import { DeliveryStatus } from '../../generated/prisma/client.js';

export class DeliveryCourseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;
}

export class DeliveryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  schoolId!: string;

  @ApiProperty({ type: DeliveryCourseDto })
  course!: DeliveryCourseDto;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  label!: string;

  @ApiProperty({ example: '2026-27' })
  academicYear!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({
    description: 'Whether the school currently has course access; informational for reads.',
  })
  subscriptionActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
