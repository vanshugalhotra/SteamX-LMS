import { ApiProperty } from '@nestjs/swagger';
import { LessonAudience } from '../../../generated/prisma/client.js';

export type ModuleReleaseState = 'NONE' | 'PARTIAL' | 'ALL';

export class DeliveryReleaseLessonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: LessonAudience })
  audience!: LessonAudience;

  @ApiProperty()
  released!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  releasedAt!: Date | null;

  @ApiProperty()
  releasable!: boolean;
}

export class DeliveryReleaseModuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: ['NONE', 'PARTIAL', 'ALL'] })
  releaseState!: ModuleReleaseState;

  @ApiProperty({ minimum: 0 })
  releasedCount!: number;

  @ApiProperty({ minimum: 0 })
  releasableLessonCount!: number;

  @ApiProperty({ type: () => [DeliveryReleaseLessonDto] })
  lessons!: DeliveryReleaseLessonDto[];
}

export class DeliveryReleasesResponseDto {
  @ApiProperty({ type: () => [DeliveryReleaseModuleDto] })
  modules!: DeliveryReleaseModuleDto[];
}

export class DeliveryLessonReleaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  lessonId!: string;

  @ApiProperty()
  released!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  releasedAt!: Date;
}

export class DeliveryModuleReleaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  moduleId!: string;

  @ApiProperty({ minimum: 0 })
  newlyReleased!: number;

  @ApiProperty({ minimum: 0 })
  alreadyReleased!: number;

  @ApiProperty({ minimum: 0 })
  skippedNotReleasable!: number;
}
