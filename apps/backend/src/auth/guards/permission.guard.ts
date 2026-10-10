import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PUBLIC_ROUTE } from '../decorators/metadata.constants.js';
import { REQUIRED_PERMISSION } from '../decorators/require-permission.decorator.js';
import type { PermissionKey } from '../permissions.js';
import { PermissionsService } from '../services/permissions.service.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }

    const requiredPermission = this.reflector.getAllAndOverride<PermissionKey>(
      REQUIRED_PERMISSION,
      targets,
    );
    if (!requiredPermission) {
      return true;
    }

    const authContext = context.switchToHttp().getRequest<Request>().authContext;
    if (!authContext || !this.permissions.has(authContext.roleKey, requiredPermission)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    }

    return true;
  }
}
