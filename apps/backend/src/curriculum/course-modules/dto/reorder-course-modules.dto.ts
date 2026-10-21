import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderCourseModulesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Every module ID in the course, in order.',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  moduleIds!: string[];
}
