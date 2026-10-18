/** Loads role grants from the database and serves authorization checks. */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuthContextRepository } from '../auth-context.repository.js';
import { PERMISSION, type PermissionKey } from '../permissions.js';

function isPermissionKey(key: string): key is PermissionKey {
  return Object.values(PERMISSION).some((permission) => permission === key);
}

/**
 * Loads role grants seeded by database migrations through AuthContextRepository, then caches them.
 * PermissionGuard calls has() for each route marked with @RequirePermission; modules do not query
 * the role-permission tables themselves.
 */
@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly permissionsByRole = new Map<string, Set<PermissionKey>>();

  constructor(
    private readonly repository: AuthContextRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PermissionsService.name);
  }

  /** Loads role grants at startup; unknown database permission keys are ignored. */
  async onModuleInit(): Promise<void> {
    // Permission data is migration-managed; keep the guard's lookups out of the request path.
    const rolePermissions = await this.repository.findRolePermissions();

    for (const role of rolePermissions) {
      this.permissionsByRole.set(
        role.key,
        new Set(role.permissions.map(({ permission }) => permission.key).filter(isPermissionKey)),
      );
    }

    if (this.permissionsByRole.size === 0) {
      this.logger.warn(
        'No role-permission mappings loaded — all permission checks will deny until restart with data.',
      );
    }
  }

  /** Checks whether a role has a permission known to this application version. */
  has(roleKey: string, permission: PermissionKey): boolean {
    return this.permissionsByRole.get(roleKey)?.has(permission) ?? false;
  }
}
