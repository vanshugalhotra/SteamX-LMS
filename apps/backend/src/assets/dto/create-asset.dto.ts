import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AssetType } from '../../generated/prisma/client.js';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { CreateAssetFileDto } from './create-asset-file.dto.js';

/** Client metadata for an upload; server-generated IDs and storage keys are not accepted here. */
export class CreateAssetDto extends CreateAssetFileDto {
  @ApiProperty({
    enum: AssetType,
    description: 'PPTX is retained in the schema but unsupported for upload.',
  })
  // Unsupported string values must reach asset rules for the ASSET_TYPE_NOT_SUPPORTED error.
  @IsString()
  type!: AssetType;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
