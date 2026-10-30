import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { EnrollmentStatus } from '../../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';

export class DeliveryEnrollmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EnrollmentStatus, default: EnrollmentStatus.ACTIVE })
  @IsEnum(EnrollmentStatus)
  status = EnrollmentStatus.ACTIVE;
}
