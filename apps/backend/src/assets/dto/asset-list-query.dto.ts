import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { AssetType, ContentStatus } from '../../generated/prisma/client.js';

const ASSET_LIBRARY_STATUSES = [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] as const;

export class AssetListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AssetType })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @ApiPropertyOptional({ enum: ASSET_LIBRARY_STATUSES, default: ContentStatus.ACTIVE })
  @IsOptional()
  @IsIn(ASSET_LIBRARY_STATUSES)
  status: ContentStatus = ContentStatus.ACTIVE;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trimmed, case-insensitive partial match on asset title',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
