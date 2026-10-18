/** Validates session cookies and attaches current user identity to HTTP requests. */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import type { Request } from 'express';
import { SchoolStatus, UserStatus } from '../../generated/prisma/client.js';
import { AuthContextRepository } from '../auth-context.repository.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { ALLOW_PASSWORD_CHANGE_ROUTE, PUBLIC_ROUTE } from '../decorators/metadata.constants.js';
import type { AuthContext } from '../types/auth-context.js';
import { TokenService } from '../services/token.service.js';

const AUTH_FAILURE_REASON = {
  MISSING_COOKIE: 'missing_cookie',
  INVALID_TOKEN: 'invalid_token',
  USER_NOT_FOUND: 'user_not_found',
  USER_INACTIVE: 'user_inactive',
  SCHOOL_INACTIVE: 'school_inactive',
  PASSWORD_CHANGED: 'password_changed',
} as const;

/** Builds the trusted request identity from the session and current database state. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: AuthContextRepository,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Validates session, account, school, and password-change state before downstream guards run.
   * Session and account failures share one 401 response to avoid disclosing account state.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // This guard protects HTTP routes; non-HTTP handlers use their transport's auth policy.
    if (context.getType() !== 'http') {
      return true;
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [handler, controller]);

    // Public routes skip cookie and account checks.
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[this.tokens.cookieOptions().name];
    // A missing session and a rejected session both return the same generic 401.
    if (typeof token !== 'string' || token.length === 0) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.MISSING_COOKIE);
    }

    // Keep token failures indistinguishable from a missing or invalid account to the caller.
    let verifiedToken: Awaited<ReturnType<TokenService['verify']>>;
    try {
      verifiedToken = await this.tokens.verify(token);
    } catch {
      // Do not expose whether the token was malformed, expired, or signed with another key.
      this.rejectAuthentication(AUTH_FAILURE_REASON.INVALID_TOKEN);
    }
    const user = await this.users.findAuthUser(verifiedToken.userId);

    // The session subject must still identify a database account.
    if (!user) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.USER_NOT_FOUND, verifiedToken.userId);
    }
    // Deactivation takes effect on the next request, even for an unexpired token.
    if (user.status !== UserStatus.ACTIVE) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.USER_INACTIVE, user.id);
    }
    // School users lose access immediately when their school is inactive; platform users have no school.
    if (user.schoolId !== null && user.school?.status !== SchoolStatus.ACTIVE) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.SCHOOL_INACTIVE, user.id);
    }
    // Password changes revoke sessions using the database timestamp, not token claims alone.
    if (verifiedToken.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1_000)) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.PASSWORD_CHANGED, user.id);
    }

    const authContext: AuthContext = {
      userId: user.id,
      steamxId: user.steamxId,
      name: user.name,
      roleKey: user.role.key,
      userType: user.userType,
      schoolId: user.schoolId,
      mustChangePassword: user.mustChangePassword,
    };
    request.authContext = authContext;
    this.logger.assign({ userId: user.id, schoolId: user.schoolId });

    // Initial or reset passwords may access only routes explicitly allowed for password changes.
    const passwordChangeAllowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_ROUTE,
      [handler, controller],
    );
    if (user.mustChangePassword && !passwordChangeAllowed) {
      throw new ForbiddenException(API_ERROR.PASSWORD_CHANGE_REQUIRED);
    }

    return true;
  }

  /** Logs a safe failure reason while returning one generic client response. */
  private rejectAuthentication(reason: string, userId?: string): never {
    this.logger.warn(
      { reason, ...(userId === undefined ? {} : { userId }) },
      'Authentication failed',
    );
    throw new UnauthorizedException(API_ERROR.AUTHENTICATION_FAILED);
  }
}
