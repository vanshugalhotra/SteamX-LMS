/** Enforces explicit authorization policy after the authentication guard runs. */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTHENTICATED_ROUTE, PUBLIC_ROUTE } from '../decorators/metadata.constants.js';
import { REQUIRED_PERMISSION } from '../decorators/require-permission.decorator.js';
import type { PermissionKey } from '../permissions.js';
import { PermissionsService } from '../services/permissions.service.js';
import { API_ERROR, permissionRequiredError } from '../../common/errors/api-errors.js';

/** Requires every protected HTTP route to declare its authorization policy explicitly. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Allows public routes, checks declared permissions, and permits marked session-only routes.
   * Missing or unauthenticated policy declarations fail closed.
   */
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }

    const authContext = context.switchToHttp().getRequest<Request>().authContext;
    const requiredPermission = this.reflector.getAllAndOverride<PermissionKey>(
      REQUIRED_PERMISSION,
      targets,
    );
    // A declared permission takes precedence over the session-only marker.
    if (requiredPermission) {
      if (!authContext) {
        throw new ForbiddenException(API_ERROR.FORBIDDEN);
      }
      if (!this.permissions.has(authContext.roleKey, requiredPermission)) {
        throw new ForbiddenException(permissionRequiredError(requiredPermission));
      }
      return true;
    }

    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ROUTE,
      targets,
    );
    if (authenticatedOnly && authContext) {
      return true;
    }

    throw new ForbiddenException(API_ERROR.FORBIDDEN);
  }
}
