/**
 * Describes user details returned by create and view routes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserStatus, UserType } from '../../generated/prisma/client.js';

export class UserRoleResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;
}

export class UserProfileResponseDto {
  @ApiPropertyOptional({ nullable: true })
  guardianName?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  classSectionId?: string;

  @ApiPropertyOptional({ nullable: true })
  primaryAssignment?: string | null;
}

export class UserResponseDto {
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

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiProperty({ type: UserProfileResponseDto, nullable: true })
  profile!: UserProfileResponseDto | null;
}
