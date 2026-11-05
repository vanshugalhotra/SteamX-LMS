import { ApiProperty } from '@nestjs/swagger';

export class LearningOutlineLessonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty()
  completed!: boolean;
}

export class LearningOutlineModuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ type: [LearningOutlineLessonDto] })
  lessons!: LearningOutlineLessonDto[];
}

export class LearningOutlineCourseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;
}

export class LearningOutlineResponseDto {
  @ApiProperty({ format: 'uuid' })
  deliveryId!: string;

  @ApiProperty({ type: LearningOutlineCourseDto })
  course!: LearningOutlineCourseDto;

  @ApiProperty({ type: [LearningOutlineModuleDto] })
  modules!: LearningOutlineModuleDto[];
}
