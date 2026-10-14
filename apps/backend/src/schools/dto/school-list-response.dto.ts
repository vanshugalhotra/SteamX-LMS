import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { SchoolResponseDto } from './school-response.dto.js';

export class SchoolListResponseDto extends PaginationResponseDto<SchoolResponseDto> {
  @ApiProperty({ type: [SchoolResponseDto] })
  override items!: SchoolResponseDto[];
}
