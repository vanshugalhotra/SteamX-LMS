import { ApiProperty } from '@nestjs/swagger';

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
}
