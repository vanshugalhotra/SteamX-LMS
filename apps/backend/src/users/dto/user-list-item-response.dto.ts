import { ApiProperty } from '@nestjs/swagger';
import type { UserStatus, UserType } from '../../generated/prisma/client.js';
import { UserRoleResponseDto } from './user-response.dto.js';

export class UserListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minLength: 6, maxLength: 6 })
  steamxId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] })
  status!: UserStatus;

  @ApiProperty({ type: UserRoleResponseDto })
  role!: UserRoleResponseDto;

  @ApiProperty({ enum: ['PLATFORM_STAFF', 'SCHOOL_STAFF', 'STUDENT'] })
  userType!: UserType;

  @ApiProperty({ format: 'uuid', nullable: true })
  schoolId!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
