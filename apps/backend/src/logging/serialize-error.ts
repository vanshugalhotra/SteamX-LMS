import { stdSerializers } from 'pino';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
} from '../common/errors/prisma-error.js';

export function serializeError(error: Error): Record<string, unknown> {
  if (isPrismaKnownError(error)) {
    return {
      type: error.name,
      prismaCode: error.code,
      postgresCode: getPostgresCode(error),
      message: getPrismaReason(error),
    };
  }

  return stdSerializers.err(error) as Record<string, unknown>;
}
