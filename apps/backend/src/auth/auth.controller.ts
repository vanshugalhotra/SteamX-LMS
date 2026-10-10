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
    description: 'Authenticated profile; session token is set as an HTTP-only cookie.',
    type: AuthProfile,
    headers: {
      'Set-Cookie': {
        description: 'Sets the steamx_session cookie.',
        schema: { type: 'string' },
      },
      'Cache-Control': {
        description: 'Prevents caching of authentication data.',
        schema: { type: 'string', example: 'no-store' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or inactive account.' })
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
  @ApiNoContentResponse({
    description: 'Session cookie cleared; no response body.',
    headers: {
      'Set-Cookie': {
        description: 'Expires the steamx_session cookie.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Session is missing or invalid.' })
  logout(@Res({ passthrough: true }) response: Response): void {
    const { name, httpOnly, secure, sameSite, path } = this.tokens.cookieOptions();
    response.clearCookie(name, { httpOnly, secure, sameSite, path });
  }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({ summary: 'Get the current authenticated profile' })
  @ApiOkResponse({
    description: 'Current authenticated profile.',
    type: AuthProfile,
    headers: {
      'Cache-Control': {
        description: 'Prevents caching of authentication data.',
        schema: { type: 'string', example: 'no-store' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Session is missing or invalid.' })
  @ApiForbiddenResponse({ description: 'Password change is required.' })
  getMe(
    @CurrentAuth() authContext: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): AuthProfile {
    response.setHeader('Cache-Control', 'no-store');
    return toAuthProfile(authContext);
  }
}
