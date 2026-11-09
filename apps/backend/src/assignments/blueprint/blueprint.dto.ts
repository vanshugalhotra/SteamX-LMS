/** Swagger DTOs for the shared assignment blueprint format. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ASSIGNMENT_LIMITS, ASSIGNMENT_ITEM_TYPE, FILE_UPLOAD_TYPE } from './constants.js';
import type {
  AssignmentBlueprintInput,
  AssignmentBlueprintItemInput,
  AssignmentBlueprintOption,
  AssignmentFileUploadConfig,
  AssignmentTextConfig,
  AssignmentItemType,
  AssignmentRubricItem,
} from './blueprint.schema.js';

export class AssignmentOptionDto {
  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.options.textMaxLength, example: 'Option A' })
  text!: AssignmentBlueprintOption['text'];

  @ApiProperty({ example: false })
  isCorrect!: AssignmentBlueprintOption['isCorrect'];
}

export class AssignmentItemConfigDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: ASSIGNMENT_LIMITS.text.maxLength,
    example: 5000,
  })
  maxLength?: AssignmentTextConfig['maxLength'];

  @ApiPropertyOptional({
    minimum: ASSIGNMENT_LIMITS.fileUpload.minFiles,
    maximum: ASSIGNMENT_LIMITS.fileUpload.maxFiles,
    example: 3,
  })
  maxFiles?: AssignmentFileUploadConfig['maxFiles'];

  @ApiPropertyOptional({
    minimum: ASSIGNMENT_LIMITS.fileUpload.minSizeMb,
    maximum: ASSIGNMENT_LIMITS.fileUpload.maxSizeMb,
    example: 10,
  })
  maxSizeMb?: AssignmentFileUploadConfig['maxSizeMb'];

  @ApiPropertyOptional({
    enum: FILE_UPLOAD_TYPE,
    isArray: true,
    minItems: 1,
    example: ['PDF', 'IMAGE'],
  })
  allowedTypes?: AssignmentFileUploadConfig['allowedTypes'];
}

export class AssignmentRubricItemDto {
  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.rubric.nameMaxLength, example: 'Knowledge' })
  name!: AssignmentRubricItem['name'];

  @ApiPropertyOptional({
    maxLength: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength,
    nullable: true,
    example: null,
  })
  description?: AssignmentRubricItem['description'];
}

export class AssignmentItemDto {
  @ApiProperty({ enum: ASSIGNMENT_ITEM_TYPE, example: ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE })
  type!: AssignmentItemType;

  @ApiProperty({
    maxLength: ASSIGNMENT_LIMITS.promptMaxLength,
    example: 'Which planet is closest to the Sun?',
  })
  prompt!: AssignmentBlueprintItemInput['prompt'];

  @ApiPropertyOptional({ type: AssignmentItemConfigDto })
  config?: AssignmentBlueprintItemInput['config'];

  @ApiPropertyOptional({
    type: AssignmentOptionDto,
    isArray: true,
    minItems: ASSIGNMENT_LIMITS.options.min,
    maxItems: ASSIGNMENT_LIMITS.options.max,
  })
  options?: AssignmentBlueprintItemInput['options'];
}

export class AssignmentBlueprintDto {
  @ApiProperty({
    type: AssignmentItemDto,
    isArray: true,
    maxItems: ASSIGNMENT_LIMITS.maxItems,
    example: [
      {
        type: ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE,
        prompt: 'Which planet is closest to the Sun?',
        options: [
          { text: 'Mercury', isCorrect: true },
          { text: 'Venus', isCorrect: false },
        ],
      },
    ],
  })
  items!: AssignmentBlueprintInput['items'];

  @ApiProperty({
    type: AssignmentRubricItemDto,
    isArray: true,
    nullable: true,
    minItems: 4,
    maxItems: 4,
    example: null,
  })
  rubric!: AssignmentBlueprintInput['rubric'];

  @ApiPropertyOptional({ default: false, example: false })
  allowResubmission?: AssignmentBlueprintInput['allowResubmission'];
}
