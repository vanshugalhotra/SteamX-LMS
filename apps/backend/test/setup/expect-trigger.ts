/**
 * Asserts that a database operation fails with a trigger RAISE
 * containing the expected message.
 */
export async function expectTriggerMessage(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let databaseError: unknown;

  try {
    await operation();
  } catch (error) {
    databaseError = error;
  }

  expect(databaseError).toBeDefined();
  const metadata =
    typeof databaseError === 'object' && databaseError !== null && 'meta' in databaseError
      ? databaseError.meta
      : undefined;
  const errorText = databaseError instanceof Error ? databaseError.message : String(databaseError);
  expect(`${errorText} ${JSON.stringify(metadata)}`).toContain(message);
}
