import { ApiProperty } from '@nestjs/swagger';

export class LearningProgressAssignmentCountsDto {
  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Assignments with no submission; ASG-4 calls this state NOT_SUBMITTED.',
  })
  pending!: number;

  @ApiProperty({ minimum: 0 })
  submitted!: number;

  @ApiProperty({ minimum: 0 })
  graded!: number;
}

export class LearningProgressModuleDto {
  @ApiProperty({ format: 'uuid' })
  moduleId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ minimum: 0 })
  totalLessons!: number;

  @ApiProperty({ minimum: 0 })
  completedLessons!: number;
}

export class LearningProgressResponseDto {
  @ApiProperty({ format: 'uuid' })
  deliveryId!: string;

  @ApiProperty({ minimum: 0 })
  totalLessons!: number;

  @ApiProperty({ minimum: 0 })
  completedLessons!: number;

  @ApiProperty({ type: [LearningProgressModuleDto] })
  modules!: LearningProgressModuleDto[];

  @ApiProperty({ type: LearningProgressAssignmentCountsDto })
  assignments!: LearningProgressAssignmentCountsDto;
}
