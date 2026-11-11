/** Response DTOs for assignment template endpoints. */
import { ApiProperty } from '@nestjs/swagger';
import { ContentStatus } from '../../../generated/prisma/client.js';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';
import { AssignmentBlueprintDto } from '../../blueprint/blueprint.dto.js';
import type { AssignmentBlueprint, AssignmentItemType } from '../../blueprint/blueprint.schema.js';

export class AssignmentTemplateSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  courseId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  moduleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  lessonId!: string | null;

  @ApiProperty({ maxLength: 200 })
  title!: string;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiProperty({ minimum: 0 })
  itemCount!: number;

  @ApiProperty({ enum: ['SINGLE_CHOICE', 'TEXT', 'FILE_UPLOAD'], isArray: true })
  itemTypes!: AssignmentItemType[];

  @ApiProperty()
  hasRubric!: boolean;

  @ApiProperty()
  allowResubmission!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class AssignmentTemplateResponseDto extends AssignmentTemplateSummaryDto {
  @ApiProperty({ maxLength: 2000, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  createdById!: string | null;

  @ApiProperty({ type: AssignmentBlueprintDto })
  blueprint!: AssignmentBlueprint;
}

export class AssignmentTemplateListResponseDto extends PaginationResponseDto<AssignmentTemplateSummaryDto> {
  @ApiProperty({ type: [AssignmentTemplateSummaryDto] })
  override items!: AssignmentTemplateSummaryDto[];
}
