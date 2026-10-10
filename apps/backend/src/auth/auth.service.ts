import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SchoolStatus, UserStatus } from '../generated/prisma/client.js';
import { AUTHENTICATION_ERROR_MESSAGE } from './auth.constants.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import { getPasswordPolicyViolations } from './validators/password-policy.js';
import type { AuthContext } from './types/auth-context.js';
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

  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const credentials = await this.users.findCredentials(auth.userId);
    if (!credentials) {
      throw new UnauthorizedException(AUTHENTICATION_ERROR_MESSAGE);
    }

    const currentPasswordMatches = await this.passwords.verify(
      credentials.passwordHash,
      currentPassword,
    );
    if (!currentPasswordMatches) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_REUSED',
        message: 'New password must be different from the current password',
      });
    }

    this.validateNewPassword(newPassword, credentials.steamxId);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(auth.userId, passwordHash, false);

    const profile: AuthProfile = {
      id: auth.userId,
      steamxId: auth.steamxId,
      name: auth.name,
      roleKey: auth.roleKey,
      userType: auth.userType,
      schoolId: auth.schoolId,
      mustChangePassword: false,
    };

    return { token: await this.tokens.sign(auth.userId), profile };
  }

  async resetPassword(
    actor: AuthContext,
    targetUserId: string,
    newPassword: string,
  ): Promise<void> {
    const target = await this.users.findPasswordResetTarget(targetUserId);
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
    if (target.id === actor.userId) {
      throw new BadRequestException({
        code: 'CANNOT_RESET_OWN_PASSWORD',
        message: 'Use change-password to update your own password',
      });
    }

    this.validateNewPassword(newPassword, target.steamxId);
    const passwordHash = await this.passwords.hash(newPassword);

    // TODO: Add school and teacher scope checks here when scoped reset permissions are introduced.
    await this.users.updatePassword(target.id, passwordHash, true);
    this.logger.info({ actorId: actor.userId, targetId: target.id }, 'Password reset');
  }

  private validateNewPassword(password: string, steamxId: string): void {
    const violations = getPasswordPolicyViolations(password, steamxId);
    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'PASSWORD_POLICY',
        message: 'Password does not meet policy requirements',
        details: violations,
      });
    }
  }
}
