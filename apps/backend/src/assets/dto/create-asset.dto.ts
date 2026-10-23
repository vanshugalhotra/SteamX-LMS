import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { AssetType } from '../../generated/prisma/client.js';
import { Trim } from '../../common/decorators/trim.decorator.js';

/** Client metadata for an upload; server-generated IDs and storage keys are not accepted here. */
export class CreateAssetDto {
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

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @Trim()
  // Filenames are display metadata only; remove control characters before storing them.
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\p{Cc}/gu, '') : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  // This is the declared MIME stored with the file and sent to the upload signer.
  @Trim({ lowercase: true })
  @IsString()
  mimeType!: string;

  @ApiProperty({
    minimum: 16,
    type: Number,
    description: 'At least 16 bytes are required for upload signature verification.',
  })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
