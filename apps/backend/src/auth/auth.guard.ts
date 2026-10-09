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
import { SchoolStatus, UserStatus } from '../generated/prisma/client.js';
import { AuthContextRepository } from './auth-context.repository.js';
import { AUTHENTICATION_ERROR_MESSAGE } from './auth.constants.js';
import { ALLOW_PASSWORD_CHANGE_ROUTE, PUBLIC_ROUTE } from './decorators/metadata.constants.js';
import type { AuthContext } from './types/auth-context.js';
import { TokenService } from './services/token.service.js';

const AUTH_FAILURE_REASON = {
  MISSING_COOKIE: 'missing_cookie',
  INVALID_TOKEN: 'invalid_token',
  USER_NOT_FOUND: 'user_not_found',
  USER_INACTIVE: 'user_inactive',
  SCHOOL_INACTIVE: 'school_inactive',
  PASSWORD_CHANGED: 'password_changed',
} as const;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: AuthContextRepository,
    private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [handler, controller]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[this.tokens.cookieOptions().name];
    if (typeof token !== 'string' || token.length === 0) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.MISSING_COOKIE);
    }

    let verifiedToken: Awaited<ReturnType<TokenService['verify']>>;
    try {
      verifiedToken = await this.tokens.verify(token);
    } catch {
      this.rejectAuthentication(AUTH_FAILURE_REASON.INVALID_TOKEN);
    }
    const user = await this.users.findAuthUser(verifiedToken.userId);

    if (!user) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.USER_NOT_FOUND, verifiedToken.userId);
    }
    if (user.status !== UserStatus.ACTIVE) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.USER_INACTIVE, user.id);
    }
    if (user.schoolId !== null && user.school?.status !== SchoolStatus.ACTIVE) {
      this.rejectAuthentication(AUTH_FAILURE_REASON.SCHOOL_INACTIVE, user.id);
    }
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

    const passwordChangeAllowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_ROUTE,
      [handler, controller],
    );
    if (user.mustChangePassword && !passwordChangeAllowed) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Password change required',
      });
    }

    return true;
  }

  private rejectAuthentication(reason: string, userId?: string): never {
    this.logger.warn(
      { reason, ...(userId === undefined ? {} : { userId }) },
      'Authentication failed',
    );
    throw new UnauthorizedException(AUTHENTICATION_ERROR_MESSAGE);
  }
}
