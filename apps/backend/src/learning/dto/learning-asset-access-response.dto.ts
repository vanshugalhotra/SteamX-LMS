import { ApiProperty } from '@nestjs/swagger';
import { AssetType } from '../../generated/prisma/client.js';

export class LearningAssetAccessViewerDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  steamxId!: string;

  @ApiProperty()
  schoolName!: string;

  @ApiProperty({ format: 'date-time' })
  issuedAt!: string;
}

export class LearningAssetAccessResponseDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ type: () => LearningAssetAccessViewerDto })
  viewer!: LearningAssetAccessViewerDto;
}
