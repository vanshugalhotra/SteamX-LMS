import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { LearningCourseResponseDto } from './learning-course-response.dto.js';

export class LearningCourseListResponseDto extends PaginationResponseDto<LearningCourseResponseDto> {
  @ApiProperty({ type: [LearningCourseResponseDto] })
  items!: LearningCourseResponseDto[];
}
