import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { DeliveryStatus } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';

export class DeliveryListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @ApiPropertyOptional({ example: '2026-27', pattern: '^\\d{4}-\\d{2}$' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  academicYear?: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}
