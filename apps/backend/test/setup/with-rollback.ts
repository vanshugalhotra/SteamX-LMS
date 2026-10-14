import type { Prisma } from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const ROLLBACK_SENTINEL = new Error('ROLLBACK_TEST');

type TransactionTest = (tx: Prisma.TransactionClient) => Promise<void>;

/**
 * Runs a test inside a transaction that always rolls back,
 * leaving the database unchanged after each test.
 */
export async function withRollback(prisma: PrismaService, test: TransactionTest): Promise<void> {
  let testFailed = false;
  let testError: unknown;

  try {
    await prisma.$transaction(async (tx) => {
      try {
        await test(tx);
      } catch (error) {
        testFailed = true;
        testError = error;
      }

      throw ROLLBACK_SENTINEL;
    });
  } catch (error) {
    if (error !== ROLLBACK_SENTINEL) {
      throw error;
    }
  }

  if (testFailed) {
    throw testError;
  }
}
