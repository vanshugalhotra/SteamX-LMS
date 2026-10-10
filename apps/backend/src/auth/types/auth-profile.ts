import { ApiProperty } from '@nestjs/swagger';
import type { AuthContext } from './auth-context.js';
import { UserType } from '../../generated/prisma/client.js';

export class AuthProfile {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  steamxId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  roleKey!: string;

  @ApiProperty({ enum: UserType })
  userType!: AuthContext['userType'];

  @ApiProperty({ format: 'uuid', nullable: true })
  schoolId!: string | null;

  @ApiProperty()
  mustChangePassword!: boolean;
}

export function toAuthProfile(auth: AuthContext): AuthProfile {
  return {
    id: auth.userId,
    steamxId: auth.steamxId,
    name: auth.name,
    roleKey: auth.roleKey,
    userType: auth.userType,
    schoolId: auth.schoolId,
    mustChangePassword: auth.mustChangePassword,
  };
}
