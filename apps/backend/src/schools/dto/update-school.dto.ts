import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSchoolDto } from './create-school.dto.js';

export class UpdateSchoolDto extends PartialType(OmitType(CreateSchoolDto, ['code'] as const), {
  skipNullProperties: false,
}) {}
