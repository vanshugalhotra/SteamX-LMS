import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../permissions.js';

export const REQUIRED_PERMISSION = 'auth:required-permission';

export const RequirePermission = (permission: PermissionKey): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);
