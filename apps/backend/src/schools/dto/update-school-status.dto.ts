import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { SchoolStatus } from '../../generated/prisma/client.js';

export class UpdateSchoolStatusDto {
  @ApiProperty({ enum: SchoolStatus })
  @Trim()
  @IsEnum(SchoolStatus)
  status!: SchoolStatus;
}
