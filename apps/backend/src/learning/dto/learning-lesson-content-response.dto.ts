import { ApiProperty } from '@nestjs/swagger';
import { AssetType } from '../../generated/prisma/client.js';
import { BlockDto } from '../../curriculum/lesson-content/dto/lesson-content-response.dto.js';

export class LearningLessonAssetDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  mimeType!: string | null;
}

export class LearningLessonContentResponseDto {
  @ApiProperty({ format: 'uuid' })
  lessonId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: () => [BlockDto] })
  blocks!: BlockDto[];

  @ApiProperty({ type: () => [LearningLessonAssetDto] })
  assets!: LearningLessonAssetDto[];
}
