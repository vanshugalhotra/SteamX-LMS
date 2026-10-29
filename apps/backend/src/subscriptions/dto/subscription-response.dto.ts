import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionStatus } from '../subscription-rules.js';

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  schoolId!: string;

  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty()
  schoolName!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiProperty({ format: 'date' })
  endDate!: string;

  @ApiProperty({ minimum: 1 })
  maxDeliveries!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({
    format: 'date',
    nullable: true,
    description: 'Latest school-course end date plus two years; informational only.',
  })
  retainedUntil!: string | null;

  @ApiProperty({
    minimum: 0,
    description: 'Number of ACTIVE deliveries for this school and course.',
  })
  activeDeliveries!: number;
}
