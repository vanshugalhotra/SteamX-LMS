import { SetMetadata } from '@nestjs/common';
import { ALLOW_PASSWORD_CHANGE_ROUTE } from './metadata.constants.js';

export const AllowWhenPasswordChangeRequired = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_ROUTE, true);
