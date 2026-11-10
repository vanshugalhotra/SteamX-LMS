/** Request and response DTOs for teacher-managed delivery assignments. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AssignmentStatus } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { ASSIGNMENT_LIMITS, RUBRIC_SIZE } from '../blueprint/constants.js';
import { AssignmentBlueprintDto, AssignmentItemDto } from '../blueprint/blueprint.dto.js';
import type {
  AssignmentBlueprintInput,
  AssignmentRubricItem,
} from '../blueprint/blueprint.schema.js';
import { OneTemplateAnchorConstraint } from '../assignment-template/dto/assignment-template.dto.js';

/** Validates the optional rubric text supplied when copying a template. */
export class AssignmentRubricOverrideDto implements AssignmentRubricItem {
  @ApiProperty({ minLength: 1, maxLength: ASSIGNMENT_LIMITS.rubric.nameMaxLength })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.rubric.nameMaxLength)
  name!: string;

  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength, nullable: true })
  @Allow()
  description!: string | null;
}

export class AssignmentRubricResponseDto {
  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength, nullable: true })
  description?: string | null;
}

export class CreateDeliveryAssignmentDto {
  @ApiProperty({ minLength: 1, maxLength: ASSIGNMENT_LIMITS.titleMaxLength })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.titleMaxLength)
  title!: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.descriptionMaxLength, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.descriptionMaxLength)
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  dueAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  @Validate(OneTemplateAnchorConstraint)
  moduleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({
    type: AssignmentBlueprintDto,
    description: 'Defaults to an empty draft blueprint with a null rubric.',
  })
  @Allow()
  blueprint?: AssignmentBlueprintInput;
}

export class CreateDeliveryAssignmentFromTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  templateId!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: ASSIGNMENT_LIMITS.titleMaxLength })
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.titleMaxLength)
  title?: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.descriptionMaxLength, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.descriptionMaxLength)
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  dueAt?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allowResubmission?: boolean;

  @ApiPropertyOptional({
    type: AssignmentRubricOverrideDto,
    isArray: true,
    minItems: RUBRIC_SIZE,
    maxItems: RUBRIC_SIZE,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(RUBRIC_SIZE)
  @ArrayMaxSize(RUBRIC_SIZE)
  @ValidateNested({ each: true })
  @Type(() => AssignmentRubricOverrideDto)
  rubric?: AssignmentRubricOverrideDto[];
}

export class UpdateDeliveryAssignmentDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: ASSIGNMENT_LIMITS.titleMaxLength })
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.titleMaxLength)
  title?: string;

  @ApiPropertyOptional({ maxLength: ASSIGNMENT_LIMITS.descriptionMaxLength, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.descriptionMaxLength)
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString({ strict: true })
  dueAt?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allowResubmission?: boolean;

  @ApiPropertyOptional({
    type: AssignmentRubricOverrideDto,
    isArray: true,
    minItems: RUBRIC_SIZE,
    maxItems: RUBRIC_SIZE,
    nullable: true,
  })
  @Allow()
  rubric?: AssignmentBlueprintInput['rubric'];

  @ApiPropertyOptional({
    type: AssignmentItemDto,
    isArray: true,
    maxItems: ASSIGNMENT_LIMITS.maxItems,
  })
  @Allow()
  items?: AssignmentBlueprintInput['items'];
}

export class DeliveryAssignmentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AssignmentStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
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
