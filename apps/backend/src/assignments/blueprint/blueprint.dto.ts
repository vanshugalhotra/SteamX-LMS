/** Request DTOs for the shared assignment blueprint format. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ASSIGNMENT_LIMITS, ASSIGNMENT_ITEM_TYPE, FILE_UPLOAD_TYPE } from './constants.js';
import {
  BlueprintItemShapeConstraint,
  MaxOneCorrectOptionConstraint,
} from './blueprint.validator.js';
import { Trim } from '../../common/decorators/trim.decorator.js';

const HTML_TAG_PATTERN = /^(?![\s\S]*<\/?[a-z][^>]*>)[\s\S]*$/i;

export class AssignmentOptionDto {
  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.options.textMaxLength, example: 'Option A' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.options.textMaxLength)
  @Matches(HTML_TAG_PATTERN, { message: 'text must be plain text, not HTML' })
  text!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isCorrect!: boolean;
}

export class AssignmentItemConfigDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: ASSIGNMENT_LIMITS.text.maxLength,
    example: 5000,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(ASSIGNMENT_LIMITS.text.maxLength)
  maxLength?: number;

  @ApiPropertyOptional({
    minimum: ASSIGNMENT_LIMITS.fileUpload.minFiles,
    maximum: ASSIGNMENT_LIMITS.fileUpload.maxFiles,
    example: 3,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(ASSIGNMENT_LIMITS.fileUpload.minFiles)
  @Max(ASSIGNMENT_LIMITS.fileUpload.maxFiles)
  maxFiles?: number;

  @ApiPropertyOptional({
    minimum: ASSIGNMENT_LIMITS.fileUpload.minSizeMb,
    maximum: ASSIGNMENT_LIMITS.fileUpload.maxSizeMb,
    example: 10,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(ASSIGNMENT_LIMITS.fileUpload.minSizeMb)
  @Max(ASSIGNMENT_LIMITS.fileUpload.maxSizeMb)
  maxSizeMb?: number;

  @ApiPropertyOptional({
    enum: FILE_UPLOAD_TYPE,
    isArray: true,
    minItems: 1,
    example: ['PDF', 'IMAGE'],
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(FILE_UPLOAD_TYPE, { each: true })
  allowedTypes?: (typeof FILE_UPLOAD_TYPE)[keyof typeof FILE_UPLOAD_TYPE][];
}

export class AssignmentRubricItemDto {
  @ApiProperty({ maxLength: ASSIGNMENT_LIMITS.rubric.nameMaxLength, example: 'Knowledge' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.rubric.nameMaxLength)
  name!: string;

  @ApiPropertyOptional({
    maxLength: ASSIGNMENT_LIMITS.rubric.descriptionMaxLength,
    nullable: true,
    example: null,
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Trim()
  @IsString()
  @MaxLength(ASSIGNMENT_LIMITS.rubric.descriptionMaxLength)
  description?: string | null;
}

export class AssignmentItemDto {
  @ApiProperty({ enum: ASSIGNMENT_ITEM_TYPE, example: ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE })
  @IsEnum(ASSIGNMENT_ITEM_TYPE)
  @Validate(BlueprintItemShapeConstraint)
  type!: (typeof ASSIGNMENT_ITEM_TYPE)[keyof typeof ASSIGNMENT_ITEM_TYPE];

  @ApiProperty({
    maxLength: ASSIGNMENT_LIMITS.promptMaxLength,
    example: 'Which planet is closest to the Sun?',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ASSIGNMENT_LIMITS.promptMaxLength)
  @Matches(HTML_TAG_PATTERN, { message: 'prompt must be plain text, not HTML' })
  prompt!: string;

  @ApiPropertyOptional({ type: AssignmentItemConfigDto })
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => AssignmentItemConfigDto)
  config?: AssignmentItemConfigDto;

  @ApiPropertyOptional({
    type: AssignmentOptionDto,
    isArray: true,
    minItems: ASSIGNMENT_LIMITS.options.min,
    maxItems: ASSIGNMENT_LIMITS.options.max,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(ASSIGNMENT_LIMITS.options.min)
  @ArrayMaxSize(ASSIGNMENT_LIMITS.options.max)
  @ValidateNested({ each: true })
  @Type(() => AssignmentOptionDto)
  @Validate(MaxOneCorrectOptionConstraint)
  options?: AssignmentOptionDto[];
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
  @IsArray()
  @ArrayMaxSize(ASSIGNMENT_LIMITS.maxItems)
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  items!: AssignmentItemDto[];

  @ApiProperty({
    type: AssignmentRubricItemDto,
    isArray: true,
    nullable: true,
    minItems: 4,
    maxItems: 4,
    example: null,
  })
  @ValidateIf((_object, value) => value !== null)
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AssignmentRubricItemDto)
  rubric!: AssignmentRubricItemDto[] | null;

  @ApiProperty({ default: false, example: false })
  @IsBoolean()
  allowResubmission = false;
}
