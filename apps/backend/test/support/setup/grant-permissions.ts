import type { PrismaClient } from '../../../src/generated/prisma/client.js';

// Run before creating the Nest app; PermissionsService loads role grants once at initialization.
export async function grantPermissions(
  prisma: PrismaClient,
  roleKey: string,
  permissionKeys: string[],
): Promise<{ revoke: () => Promise<void> }> {
  const role = await prisma.role.findUnique({
    where: { key: roleKey },
    select: { id: true },
  });
  if (!role) {
    throw new Error(`Cannot grant permissions: role "${roleKey}" does not exist.`);
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });
  const foundKeys = new Set(permissions.map(({ key }) => key));
  const missingKeys = permissionKeys.filter((key) => !foundKeys.has(key));
  if (missingKeys.length > 0) {
    throw new Error(
      `Cannot grant permissions to "${roleKey}": unknown permission keys ${missingKeys.join(', ')}.`,
    );
  }

  const existing = await prisma.rolePermission.findMany({
    where: {
      roleId: role.id,
      permissionId: { in: permissions.map(({ id }) => id) },
    },
    select: { permissionId: true },
  });
  const existingIds = new Set(existing.map(({ permissionId }) => permissionId));
  const addedPermissionIds = permissions
    .map(({ id }) => id)
    .filter((permissionId) => !existingIds.has(permissionId));

  if (addedPermissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: addedPermissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }

  return {
    revoke: async () => {
      if (addedPermissionIds.length === 0) {
        return;
      }

      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: addedPermissionIds } },
      });
    },
  };
}
