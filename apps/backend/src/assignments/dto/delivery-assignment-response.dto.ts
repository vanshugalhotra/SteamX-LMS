/** Response DTOs for teacher-managed delivery assignments. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { ASSIGNMENT_LIMITS } from '../blueprint/constants.js';
import type { AssignmentBlueprintInput } from '../blueprint/blueprint.schema.js';
import { AssignmentStatus } from '../../generated/prisma/client.js';

export class AssignmentRubricResponseDto {
  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength, nullable: true })
  description?: string | null;
}

export class DeliveryAssignmentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.titleMaxLength })
  title!: string;

  @ApiProperty({ enum: AssignmentStatus })
  status!: AssignmentStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  moduleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  lessonId!: string | null;

  @ApiProperty()
  allowResubmission!: boolean;

  @ApiProperty()
  hasRubric!: boolean;

  @ApiProperty({ minimum: 0 })
  itemCount!: number;

  @ApiProperty({ minimum: 0 })
  submissionCount!: number;

  @ApiProperty({ minimum: 0 })
  gradedCount!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DeliveryAssignmentOptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional()
  isCorrect?: boolean;
}

export class DeliveryAssignmentItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ enum: ['SINGLE_CHOICE', 'TEXT', 'FILE_UPLOAD'] })
  type!: string;

  @ApiProperty()
  prompt!: string;

  @ApiProperty({ nullable: true })
  config!: unknown;

  @ApiProperty({ type: [DeliveryAssignmentOptionResponseDto] })
  options!: DeliveryAssignmentOptionResponseDto[];
}

export class DeliveryAssignmentResponseDto extends DeliveryAssignmentSummaryDto {
  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.descriptionMaxLength, nullable: true })
  description!: string | null;

  @ApiProperty({ type: [AssignmentRubricResponseDto], nullable: true })
  rubric!: AssignmentBlueprintInput['rubric'];

  @ApiProperty({ type: [DeliveryAssignmentItemResponseDto] })
  items!: DeliveryAssignmentItemResponseDto[];

  @ApiProperty()
  contentEditable!: boolean;
}

export class DeliveryAssignmentListResponseDto extends PaginationResponseDto<DeliveryAssignmentSummaryDto> {
  @ApiProperty({ type: [DeliveryAssignmentSummaryDto] })
  override items!: DeliveryAssignmentSummaryDto[];
}
