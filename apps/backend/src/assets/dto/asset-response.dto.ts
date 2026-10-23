import { ApiProperty } from '@nestjs/swagger';
import { AssetFileStatus, AssetType, ContentStatus } from '../../generated/prisma/client.js';

/** Public identity and content status; file-specific state is returned separately. */
export class AssetDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Public upload/processing state for a single stored-file attempt. */
export class AssetFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  assetId!: string;

  @ApiProperty({ enum: AssetFileStatus })
  status!: AssetFileStatus;

  @ApiProperty({ nullable: true, maxLength: 255 })
  originalFilename!: string | null;

  @ApiProperty({ nullable: true })
  mimeType!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  sizeBytes!: number | null;

  @ApiProperty({ nullable: true, maxLength: 255 })
  lastError!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** Headers the client must send with the one-shot presigned PUT request. */
export class UploadHeadersDto {
  @ApiProperty({ example: 'image/jpeg' })
  'Content-Type'!: string;

  @ApiProperty({ example: '*' })
  'If-None-Match'!: string;
}

/** Temporary storage instructions; the URL is returned to the caller, never logged. */
export class UploadInstructionsDto {
  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @ApiProperty({ type: UploadHeadersDto })
  headers!: UploadHeadersDto;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

/** Combined result returned when creating the asset and its initial file record. */
export class CreateAssetResponseDto {
  @ApiProperty({ type: AssetDto })
  asset!: AssetDto;

  @ApiProperty({ type: AssetFileDto })
  file!: AssetFileDto;

  @ApiProperty({ type: UploadInstructionsDto })
  upload!: UploadInstructionsDto;
}
