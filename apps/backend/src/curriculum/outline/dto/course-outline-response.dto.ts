import { ApiProperty } from '@nestjs/swagger';
import { ContentStatus, LessonAudience } from '../../../generated/prisma/client.js';

export class CourseOutlineLessonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ enum: LessonAudience })
  audience!: LessonAudience;
}

export class CourseOutlineModuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ type: () => [CourseOutlineLessonDto] })
  lessons!: CourseOutlineLessonDto[];
}

export class CourseOutlineCourseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 2000 })
  description!: string | null;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;
}

export class CourseOutlineResponseDto {
  @ApiProperty({ type: () => CourseOutlineCourseDto })
  course!: CourseOutlineCourseDto;

  @ApiProperty({ type: () => [CourseOutlineModuleDto] })
  modules!: CourseOutlineModuleDto[];
}
