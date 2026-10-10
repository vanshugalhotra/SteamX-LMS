import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { CurrentAuth } from './decorators/current-auth.decorator.js';
import { PERMISSION } from './permissions.js';
import type { AuthContext } from './types/auth-context.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

@ApiTags('Users')
@ApiCookieAuth('cookieAuth')
@Controller({ path: 'users', version: '1' })
export class UserPasswordController {
  constructor(private readonly auth: AuthService) {}

  // TODO: Keep this controller here until the Users module is introduced.
  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Post(':userId/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a user password' })
  @ApiNoContentResponse({ description: 'Password reset; the user must change it after login.' })
  @ApiBadRequestResponse({ description: 'Password is invalid or this is a self-reset.' })
  @ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
  @ApiForbiddenResponse({ description: 'The caller cannot reset passwords.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  resetPassword(
    @CurrentAuth() actor: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    return this.auth.resetPassword(actor, userId, body.newPassword);
  }
}
