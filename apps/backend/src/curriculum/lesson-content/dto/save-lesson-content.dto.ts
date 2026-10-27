// Request shape for replacing all content in one lesson.
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Min } from 'class-validator';

/** Checks the save version and blocks array; block details are validated separately. */
export class SaveLessonContentDto {
  /** Version returned by the latest lesson-content read or save. */
  @ApiProperty({ minimum: 0, type: Number, description: 'Version from the latest read or save.' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  /** Complete replacement tree; the lesson-content validator checks each block. */
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Free-form block array. Block content is validated by the lesson-content rules in docs/lesson-content.md.',
  })
  // Block details are checked by validateLessonContent, not class-validator.
  @IsArray()
  blocks!: unknown[];
}
