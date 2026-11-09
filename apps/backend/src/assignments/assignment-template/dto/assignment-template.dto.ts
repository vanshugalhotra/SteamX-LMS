/** Request and response DTOs for assignment template endpoints. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Allow,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ContentStatus } from '../../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto.js';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { AssignmentBlueprintDto } from '../../blueprint/blueprint.dto.js';
import type {
  AssignmentBlueprint,
  AssignmentBlueprintInput,
  AssignmentItemType,
} from '../../blueprint/blueprint.schema.js';

/** Rejects template anchors that name both a module and a lesson. */
@ValidatorConstraint({ name: 'oneTemplateAnchor', async: false })
export class OneTemplateAnchorConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as Record<string, unknown>;
    return !(body.moduleId !== undefined && body.lessonId !== undefined);
  }

  defaultMessage(): string {
    return 'Choose at most one module or lesson anchor';
  }
}

export class CreateAssignmentTemplateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @Validate(OneTemplateAnchorConstraint)
  courseId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  moduleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  lessonId?: string;

  @ApiProperty({ minLength: 1, maxLength: 200, example: 'Solar system review' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    type: AssignmentBlueprintDto,
    description:
      'Defaults to an empty draft blueprint with a null rubric and resubmission disabled.',
    example: {
      items: [],
      rubric: null,
      allowResubmission: false,
    },
  })
  @Allow()
  blueprint?: AssignmentBlueprintInput;
}

export class UpdateAssignmentTemplateDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @ValidateIf((_object, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: AssignmentBlueprintDto })
  @Allow()
  blueprint?: AssignmentBlueprintInput;
}

export class UpdateAssignmentTemplateStatusDto {
  @ApiProperty({ enum: ContentStatus, example: ContentStatus.ACTIVE })
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}

export class AssignmentTemplateListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  moduleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  lessonId?: string;

  @ApiPropertyOptional({ enum: ContentStatus })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

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
