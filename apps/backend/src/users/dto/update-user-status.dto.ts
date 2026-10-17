import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { UserStatus } from '../../generated/prisma/client.js';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus })
  @Trim()
  @IsEnum(UserStatus)
  status!: UserStatus;
}
