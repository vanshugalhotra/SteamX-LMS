import { ApiProperty } from '@nestjs/swagger';

export class LearningCourseSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}

export class LearningCourseResponseDto {
  @ApiProperty({ format: 'uuid' })
  deliveryId!: string;

  @ApiProperty({ type: LearningCourseSummaryDto })
  course!: LearningCourseSummaryDto;

  @ApiProperty()
  className!: string;

  @ApiProperty()
  sectionName!: string;

  @ApiProperty({ example: '2026-27' })
  academicYear!: string;

  @ApiProperty({ minimum: 0 })
  totalLessons!: number;

  @ApiProperty({ minimum: 0 })
  completedLessons!: number;

  @ApiProperty()
  subscriptionActive!: boolean;
}
