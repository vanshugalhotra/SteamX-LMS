import { applyDecorators } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiInternalServerErrorResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

export function ApiProtectedController(): ClassDecorator {
  return applyDecorators(
    ApiCookieAuth('cookieAuth'),
    ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' }),
    ApiInternalServerErrorResponse({ description: 'An unexpected server error occurred.' }),
  );
}
