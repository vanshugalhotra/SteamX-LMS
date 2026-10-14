/**
 * Reuses create validation for edits, making fields optional while excluding school code.
 */
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSchoolDto } from './create-school.dto.js';

export class UpdateSchoolDto extends PartialType(OmitType(CreateSchoolDto, ['code'] as const), {
  skipNullProperties: false,
}) {}
