/** Makes course creation fields optional while still validating explicitly supplied null values. */
import { PartialType } from '@nestjs/swagger';
import { CreateCourseDto } from './create-course.dto.js';

export class UpdateCourseDto extends PartialType(CreateCourseDto, {
  skipNullProperties: false,
}) {}
