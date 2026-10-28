/** Implements authentication rules while leaving cookie and HTTP response handling to the controller. */
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SchoolStatus, UserStatus } from '../generated/prisma/client.js';
import { API_ERROR } from '../common/errors/api-errors.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { PasswordService } from './services/password.service.js';
import { TokenService } from './services/token.service.js';
import { getPasswordPolicyViolations } from '../common/validators/password-policy.js';
import type { AuthContext } from './types/auth-context.js';
import { type AuthProfile, toAuthProfile } from './types/auth-profile.js';

export type LoginResult = {
  token: string;
  profile: AuthProfile;
};

/** Implements login and password-change business rules. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthContextRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  // ─────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────

  /**
   * Normalizes the login ID and authenticates an active account.
   * Returns a token and public profile; failed credentials or inactive accounts throw 401.
   */
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
      throw new UnauthorizedException(API_ERROR.AUTHENTICATION_FAILED);
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

  // ─────────────────────────────────────────
  // Change password
  // ─────────────────────────────────────────

  /**
   * Verifies and replaces the caller's password and change timestamp, then issues a fresh token and profile.
   * Missing accounts throw 401; incorrect or policy-invalid passwords throw 400.
   */
  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<LoginResult> {
    const credentials = await this.users.findCredentials(auth.userId);
    if (!credentials) {
      throw new UnauthorizedException(API_ERROR.AUTHENTICATION_FAILED);
    }

    const currentPasswordMatches = await this.passwords.verify(
      credentials.passwordHash,
      currentPassword,
    );
    if (!currentPasswordMatches) {
      throw new BadRequestException({
        ...API_ERROR.INVALID_CURRENT_PASSWORD,
      });
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException({
        ...API_ERROR.PASSWORD_REUSED,
      });
    }

    this.validateNewPassword(newPassword, credentials.steamxId);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.users.updatePassword(auth.userId, passwordHash, false);

    const profile = toAuthProfile({ ...auth, mustChangePassword: false });
    return { token: await this.tokens.sign(auth.userId), profile };
  }

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────

  private validateNewPassword(password: string, steamxId: string): void {
    const violations = getPasswordPolicyViolations(password, steamxId);
    if (violations.length > 0) {
      throw new BadRequestException({ ...API_ERROR.PASSWORD_POLICY, details: violations });
    }
  }
}
