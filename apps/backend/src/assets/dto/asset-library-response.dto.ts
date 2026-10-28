import { ApiProperty } from '@nestjs/swagger';
import { AssetFileStatus, AssetType, ContentStatus } from '../../generated/prisma/client.js';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { AssetFileDto } from './asset-response.dto.js';

export class AssetListFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AssetFileStatus })
  status!: AssetFileStatus;

  @ApiProperty({ nullable: true })
  lastError!: string | null;

  @ApiProperty({ nullable: true, maxLength: 255 })
  mimeType!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  sizeBytes!: number | null;

  @ApiProperty({ nullable: true, maxLength: 255 })
  originalFilename!: string | null;
}

export class AssetListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AssetType })
  type!: AssetType;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ enum: [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] })
  status!: ContentStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    type: AssetListFileDto,
    nullable: true,
    description:
      'READY file when present; otherwise the most recent file. Null when the asset has no files.',
  })
  file!: AssetListFileDto | null;
}

export class AssetListResponseDto extends PaginationResponseDto<AssetListItemDto> {
  @ApiProperty({ type: [AssetListItemDto] })
  override items!: AssetListItemDto[];
}

export class AssetUsageItemDto {
  @ApiProperty({ format: 'uuid' })
  lessonId!: string;

  @ApiProperty()
  lessonTitle!: string;

  @ApiProperty({ enum: ContentStatus })
  lessonStatus!: ContentStatus;

  @ApiProperty({ format: 'uuid' })
  moduleId!: string;

  @ApiProperty()
  moduleTitle!: string;

  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty()
  courseTitle!: string;
}

export class AssetUsageDto {
  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ type: [AssetUsageItemDto] })
  items!: AssetUsageItemDto[];
}

export class AssetLibraryDetailDto {
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

  @ApiProperty({
    type: AssetFileDto,
    nullable: true,
    description:
      'Current file is the READY file when present; otherwise it is the most recently created file, with ID as the tie-breaker. Null when there are no files.',
  })
  file!: AssetFileDto | null;

  @ApiProperty({ type: AssetUsageDto })
  usedIn!: AssetUsageDto;
}
