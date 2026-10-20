import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';
import { CourseResponseDto } from './course-response.dto.js';

export class CourseListResponseDto extends PaginationResponseDto<CourseResponseDto> {
  @ApiProperty({ type: [CourseResponseDto] })
  override items!: CourseResponseDto[];
}
