import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { ContentStatus } from '../../../generated/prisma/client.js';

export class CourseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Case-insensitive partial match on course title',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
