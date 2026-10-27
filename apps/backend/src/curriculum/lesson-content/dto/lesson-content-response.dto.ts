import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
} from '../../../generated/prisma/client.js';

export class BlockDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: BlockType })
  type!: BlockType;

  @ApiPropertyOptional({ format: 'uuid' })
  assetId?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Free-form content object; supported shapes are described in docs/lesson-content.md.',
  })
  content!: Record<string, unknown>;

  @ApiPropertyOptional({
    type: () => [BlockDto],
    description: 'Only for TWO_COLUMN. Always has two entries; each entry may be null.',
  })
  columns?: [BlockDto | null, BlockDto | null];
}

export class AssetSummaryFileDto {
  @ApiProperty({ enum: AssetFileStatus })
  status!: AssetFileStatus;

  @ApiProperty({ type: String, nullable: true })
  mimeType!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ type: String, nullable: true })
  originalFilename!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastError!: string | null;
}

export class AssetSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ type: () => AssetSummaryFileDto, nullable: true })
  file!: AssetSummaryFileDto | null;
}

export class LessonContentResponseDto {
  @ApiProperty({ minimum: 0 })
  version!: number;

  @ApiProperty({ type: () => [BlockDto] })
  blocks!: BlockDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/AssetSummaryDto' },
    description: 'Asset summaries keyed by asset ID. The frontend requests access URLs separately.',
  })
  assets!: Record<string, AssetSummaryDto>;
}
