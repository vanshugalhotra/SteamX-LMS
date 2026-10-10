import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SchoolStatus, UserStatus } from '../generated/prisma/client.js';
import { AUTHENTICATION_ERROR_MESSAGE } from './auth.constants.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import type { AuthProfile } from './types/auth-profile.js';

export type LoginResult = {
  token: string;
  profile: AuthProfile;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthContextRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly logger: PinoLogger,
  ) {}

  async login(rawSteamxId: string, password: string): Promise<LoginResult> {
    const steamxId = rawSteamxId.trim().toUpperCase();
    const user = await this.users.findLoginUser(steamxId);
    const passwordMatches = await this.passwords.verify(user?.passwordHash ?? null, password);

    if (
      !user ||
      !passwordMatches ||
      user.status !== UserStatus.ACTIVE ||
      (user.schoolId !== null && user.school?.status !== SchoolStatus.ACTIVE)
    ) {
      this.logger.warn({ steamxId: steamxId.slice(0, 64) }, 'Login failed');
      throw new UnauthorizedException(AUTHENTICATION_ERROR_MESSAGE);
    }

    const token = await this.tokens.sign(user.id);
    const profile: AuthProfile = {
      id: user.id,
      steamxId: user.steamxId,
      name: user.name,
      roleKey: user.role.key,
      userType: user.userType,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
    };

    this.logger.info({ userId: user.id, schoolId: user.schoolId }, 'Login successful');
    return { token, profile };
  }
}
