/**
 * Position offset applied during reorder transactions to avoid unique-constraint
 * collisions while assigning final positions.
 */
export const PARK_OFFSET = 1_000_000;

/** Returns whether requested IDs are an exact, duplicate-free permutation of existing IDs. */
export function isValidReorder(
  requestedIds: readonly string[],
  existingIds: readonly string[],
): boolean {
  if (requestedIds.length !== existingIds.length) {
    return false;
  }

  const requested = new Set(requestedIds);
  return requested.size === requestedIds.length && existingIds.every((id) => requested.has(id));
}
