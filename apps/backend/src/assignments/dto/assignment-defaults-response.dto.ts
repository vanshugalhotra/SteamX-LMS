/** Swagger response DTOs for the authenticated assignment defaults endpoint. */
import { ApiProperty } from '@nestjs/swagger';
import { ASSIGNMENT_LIMITS, RUBRIC_SIZE } from '../blueprint/constants.js';

export class AssignmentDefaultRubricCategoryDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}

export class AssignmentDefaultRubricDto {
  @ApiProperty({ example: RUBRIC_SIZE })
  size!: number;

  @ApiProperty({ type: [AssignmentDefaultRubricCategoryDto] })
  categories!: AssignmentDefaultRubricCategoryDto[];
}

export class AssignmentDefaultGradeLevelDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  letter!: string;
}

export class AssignmentOptionsLimitsDto {
  @ApiProperty({ example: ASSIGNMENT_LIMITS.options.min })
  min!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.options.max })
  max!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.options.textMaxLength })
  textMaxLength!: number;
}

export class AssignmentRubricLimitsDto {
  @ApiProperty({ example: ASSIGNMENT_LIMITS.rubric.nameMaxLength })
  nameMaxLength!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength })
  descriptionMaxLength!: number;
}

export class AssignmentTextLimitsDto {
  @ApiProperty({ example: ASSIGNMENT_LIMITS.text.maxLength })
  maxLength!: number;
}

export class AssignmentFileUploadLimitsDto {
  @ApiProperty({ example: ASSIGNMENT_LIMITS.fileUpload.minFiles })
  minFiles!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.fileUpload.maxFiles })
  maxFiles!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.fileUpload.minSizeMb })
  minSizeMb!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.fileUpload.maxSizeMb })
  maxSizeMb!: number;

  @ApiProperty({ enum: ASSIGNMENT_LIMITS.fileUpload.allowedTypes, isArray: true })
  allowedTypes!: typeof ASSIGNMENT_LIMITS.fileUpload.allowedTypes;
}

export class AssignmentDefaultLimitsDto {
  @ApiProperty({ example: ASSIGNMENT_LIMITS.maxItems })
  maxItems!: number;

  @ApiProperty({ example: ASSIGNMENT_LIMITS.promptMaxLength })
  promptMaxLength!: number;

  @ApiProperty({ type: AssignmentOptionsLimitsDto })
  options!: typeof ASSIGNMENT_LIMITS.options;

  @ApiProperty({ type: AssignmentRubricLimitsDto })
  rubric!: typeof ASSIGNMENT_LIMITS.rubric;

  @ApiProperty({ type: AssignmentTextLimitsDto })
  text!: typeof ASSIGNMENT_LIMITS.text;

  @ApiProperty({ type: AssignmentFileUploadLimitsDto })
  fileUpload!: typeof ASSIGNMENT_LIMITS.fileUpload;
}

export class AssignmentDefaultsResponseDto {
  @ApiProperty({ type: AssignmentDefaultRubricDto })
  rubric!: AssignmentDefaultRubricDto;

  @ApiProperty({ type: [AssignmentDefaultGradeLevelDto] })
  gradeLevels!: AssignmentDefaultGradeLevelDto[];

  @ApiProperty({ type: AssignmentDefaultLimitsDto })
  limits!: AssignmentDefaultLimitsDto;
}
