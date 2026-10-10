import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthContextRepository } from './auth-context.repository.js';
import { PERMISSION, type PermissionKey } from './permissions.js';

function isPermissionKey(key: string): key is PermissionKey {
  return Object.values(PERMISSION).some((permission) => permission === key);
}

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly permissionsByRole = new Map<string, Set<PermissionKey>>();

  constructor(private readonly repository: AuthContextRepository) {}

  async onModuleInit(): Promise<void> {
    const rolePermissions = await this.repository.findRolePermissions();

    for (const role of rolePermissions) {
      this.permissionsByRole.set(
        role.key,
        new Set(role.permissions.map(({ permission }) => permission.key).filter(isPermissionKey)),
      );
    }
  }

  has(roleKey: string, permission: PermissionKey): boolean {
    return this.permissionsByRole.get(roleKey)?.has(permission) ?? false;
  }
}
