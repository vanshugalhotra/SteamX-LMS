import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { ContentStatus } from '../../../generated/prisma/client.js';

export class UpdateCourseModuleStatusDto {
  @ApiProperty({ enum: ContentStatus })
  @Trim()
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}
