/**
 * Adds class-section response items to the shared pagination shape.
 */
import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { ClassSectionResponseDto } from './class-section-response.dto.js';

export class ClassSectionListResponseDto extends PaginationResponseDto<ClassSectionResponseDto> {
  @ApiProperty({ type: [ClassSectionResponseDto] })
  override items!: ClassSectionResponseDto[];
}
