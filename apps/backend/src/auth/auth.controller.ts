import { Controller, Body, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AllowWhenPasswordChangeRequired } from './decorators/allow-when-password-change-required.decorator.js';
import { CurrentAuth } from './decorators/current-auth.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { AuthContext } from './types/auth-context.js';
import { AuthProfile, toAuthProfile } from './types/auth-profile.js';
import { TokenService } from './services/token.service.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  // ─────────────────────────────────────────
  // POST /auth/login — Log in
  // ─────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with a SteamX ID and password' })
  @ApiOkResponse({
    description: 'Returns the profile and sets the session cookie.',
    type: AuthProfile,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.', type: ApiErrorResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body.', type: ApiErrorResponseDto })
  @ApiForbiddenResponse({
    description: 'The request Origin is not allowed.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthProfile> {
    response.setHeader('Cache-Control', 'no-store');
    const { token, profile } = await this.auth.login(body.steamxId, body.password);
    const { name, ...cookieOptions } = this.tokens.cookieOptions();
    response.cookie(name, token, cookieOptions);
    return profile;
  }

  // ─────────────────────────────────────────
  // POST /auth/logout — Log out
  // ─────────────────────────────────────────

  @AllowWhenPasswordChangeRequired()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Log out and clear the session cookie' })
  @ApiNoContentResponse({ description: 'Session cookie cleared.' })
  @ApiUnauthorizedResponse({
    description: 'Session is invalid or missing.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'The request Origin is not allowed.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  logout(@Res({ passthrough: true }) response: Response): void {
    const { name, httpOnly, secure, sameSite, path } = this.tokens.cookieOptions();
    response.clearCookie(name, { httpOnly, secure, sameSite, path });
  }

  // ─────────────────────────────────────────
  // GET /auth/me — Current profile
  // ─────────────────────────────────────────

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Get the current authenticated profile' })
  @ApiOkResponse({ description: 'Returns the current profile.', type: AuthProfile })
  @ApiUnauthorizedResponse({
    description: 'Session is invalid or missing.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Password change is required.', type: ApiErrorResponseDto })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  getMe(
    @CurrentAuth() authContext: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): AuthProfile {
    response.setHeader('Cache-Control', 'no-store');
    return toAuthProfile(authContext);
  }

  // ─────────────────────────────────────────
  // POST /auth/change-password — Change password
  // ─────────────────────────────────────────

  @AllowWhenPasswordChangeRequired()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiOkResponse({
    description: 'Returns the updated profile and refreshes the session.',
    type: AuthProfile,
  })
  @ApiBadRequestResponse({
    description: 'Current password is incorrect or new password is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Session is invalid or missing.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Password change is required or the request Origin is not allowed.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    type: ApiErrorResponseDto,
  })
  async changePassword(
    @CurrentAuth() authContext: AuthContext,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthProfile> {
    response.setHeader('Cache-Control', 'no-store');
    const { token, profile } = await this.auth.changePassword(
      authContext,
      body.currentPassword,
      body.newPassword,
    );
    const { name, ...cookieOptions } = this.tokens.cookieOptions();
    response.cookie(name, token, cookieOptions);
    return profile;
  }
}
