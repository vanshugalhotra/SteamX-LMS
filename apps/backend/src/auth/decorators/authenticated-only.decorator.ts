import { SetMetadata } from '@nestjs/common';
import { AUTHENTICATED_ROUTE } from './metadata.constants.js';

export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ROUTE, true);
