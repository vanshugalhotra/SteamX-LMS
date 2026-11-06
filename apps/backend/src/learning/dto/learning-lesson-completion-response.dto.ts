import { ApiProperty } from '@nestjs/swagger';

export class LearningLessonCompletionResponseDto {
  @ApiProperty({ format: 'uuid' })
  lessonId!: string;

  @ApiProperty()
  completed!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: string;
}
