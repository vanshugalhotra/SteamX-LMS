/**
 * Makes the create names optional but keeps null values subject to validation.
 */
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateClassSectionDto } from './create-class-section.dto.js';

export class UpdateClassSectionDto extends PartialType(
  OmitType(CreateClassSectionDto, ['schoolId'] as const),
  { skipNullProperties: false },
) {}
