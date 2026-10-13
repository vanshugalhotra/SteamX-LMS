import { isPrismaKnownError, getPostgresCode } from '../../src/common/errors/prisma-error.js';

/**
 * Asserts that a database operation fails with a specific PostgreSQL
 * constraint violation (CHECK = 23514, UNIQUE = 23505).
 */
export async function expectConstraint(
  operation: () => Promise<unknown>,
  postgresCode: '23514' | '23505',
  constraintName: string,
): Promise<void> {
  let databaseError: unknown;

  try {
    await operation();
  } catch (error) {
    databaseError = error;
  }

  expect(databaseError).toBeDefined();
  if (!isPrismaKnownError(databaseError)) {
    throw new Error('Expected a Prisma database error');
  }

  expect(getPostgresCode(databaseError)).toBe(postgresCode);
  expect(
    JSON.stringify({
      message: databaseError.message,
      meta: databaseError.meta,
    }),
  ).toContain(constraintName);
}
