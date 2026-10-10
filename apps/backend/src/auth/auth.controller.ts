import { Controller, Body, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
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

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with a SteamX ID and password' })
  @ApiOkResponse({
    description: 'Returns the profile and sets the session cookie.',
    type: AuthProfile,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  @ApiBadRequestResponse({ description: 'Invalid request body.' })
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

  @AllowWhenPasswordChangeRequired()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Log out and clear the session cookie' })
  @ApiNoContentResponse({ description: 'Session cookie cleared.' })
  @ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
  logout(@Res({ passthrough: true }) response: Response): void {
    const { name, httpOnly, secure, sameSite, path } = this.tokens.cookieOptions();
    response.clearCookie(name, { httpOnly, secure, sameSite, path });
  }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Get the current authenticated profile' })
  @ApiOkResponse({ description: 'Returns the current profile.', type: AuthProfile })
  @ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
  @ApiForbiddenResponse({ description: 'Password change is required.' })
  getMe(
    @CurrentAuth() authContext: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): AuthProfile {
    response.setHeader('Cache-Control', 'no-store');
    return toAuthProfile(authContext);
  }

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
  })
  @ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
  @ApiForbiddenResponse({ description: 'Password change is required.' })
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
