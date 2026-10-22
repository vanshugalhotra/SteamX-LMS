/** Makes module creation fields optional while still validating explicitly supplied values. */
import { PartialType } from '@nestjs/swagger';
import { CreateCourseModuleDto } from './create-course-module.dto.js';

export class UpdateCourseModuleDto extends PartialType(CreateCourseModuleDto, {
  skipNullProperties: false,
}) {}
