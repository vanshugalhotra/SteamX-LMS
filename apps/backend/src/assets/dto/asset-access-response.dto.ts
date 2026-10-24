import { ApiProperty } from '@nestjs/swagger';
import { AssetType } from '../../generated/prisma/client.js';

/** Short-lived URL for inline access to a READY asset file. */
export class AssetAccessResponseDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty({ example: 'image/png' })
  mimeType!: string;
}
