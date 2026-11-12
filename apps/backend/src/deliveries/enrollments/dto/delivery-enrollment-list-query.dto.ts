import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { EnrollmentStatus } from '../../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';

/** Optionally filters delivery enrollment history by status. */
export class DeliveryEnrollmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
