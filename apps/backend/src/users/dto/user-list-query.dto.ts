import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto.js';
import { USER_ROLE_KEY } from '../../auth/permissions.js';
import { UserStatus } from '../../generated/prisma/client.js';

const USER_ROLE_KEYS = Object.values(USER_ROLE_KEY);

export class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({ enum: USER_ROLE_KEYS })
  @IsOptional()
  @IsIn(USER_ROLE_KEYS)
  role?: (typeof USER_ROLE_KEYS)[number];

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
