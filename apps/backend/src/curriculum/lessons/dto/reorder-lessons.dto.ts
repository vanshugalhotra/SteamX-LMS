import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderLessonsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Every lesson ID in the module, in order.',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  lessonIds!: string[];
}
