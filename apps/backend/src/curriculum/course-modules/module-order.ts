/** Returns whether requested IDs are an exact, duplicate-free permutation of existing IDs. */
export function isValidModuleOrder(
  moduleIds: readonly string[],
  existingIds: readonly string[],
): boolean {
  if (moduleIds.length !== existingIds.length) {
    return false;
  }

  const requested = new Set(moduleIds);
  return requested.size === moduleIds.length && existingIds.every((id) => requested.has(id));
}
