import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ContentStatus } from '../../generated/prisma/client.js';

const ASSET_STATUSES = [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] as const;

export class UpdateAssetStatusDto {
  @ApiProperty({ enum: ASSET_STATUSES })
  @IsIn(ASSET_STATUSES)
  status!: (typeof ASSET_STATUSES)[number];
}
