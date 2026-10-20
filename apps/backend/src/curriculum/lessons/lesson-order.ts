/** Returns whether requested IDs are an exact, duplicate-free permutation of existing IDs. */
export function isValidLessonOrder(
  lessonIds: readonly string[],
  existingIds: readonly string[],
): boolean {
  if (lessonIds.length !== existingIds.length) {
    return false;
  }

  const requested = new Set(lessonIds);
  return requested.size === lessonIds.length && existingIds.every((id) => requested.has(id));
}
