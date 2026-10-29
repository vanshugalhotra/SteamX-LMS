/** Extracts safe Prisma error information and maps known constraint cases to API exceptions. */
import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { API_ERROR } from './api-errors.js';

type PrismaKnownError = {
  name: 'PrismaClientKnownRequestError';
  code: string;
  message?: unknown;
  meta?: unknown;
};

/** Identifies known Prisma request errors without trusting an arbitrary thrown value. */
export function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'PrismaClientKnownRequestError' &&
    'code' in error &&
    typeof error.code === 'string'
  );
}

/** Extracts PostgreSQL's code from Prisma metadata or an adapter error at transaction commit. */
export function getPostgresCode(error: unknown): string | undefined {
  let adapterCause: unknown;
  if (isPrismaKnownError(error)) {
    if (
      typeof error.meta === 'object' &&
      error.meta !== null &&
      'driverAdapterError' in error.meta
    ) {
      const driverAdapterError = error.meta.driverAdapterError;
      if (typeof driverAdapterError === 'object' && driverAdapterError !== null) {
        adapterCause = 'cause' in driverAdapterError ? driverAdapterError.cause : undefined;
      }
    }
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'DriverAdapterError' &&
    'cause' in error
  ) {
    adapterCause = error.cause;
  }

  if (typeof adapterCause !== 'object' || adapterCause === null) {
    return undefined;
  }
  if ('originalCode' in adapterCause && typeof adapterCause.originalCode === 'string') {
    return adapterCause.originalCode;
  }
  if (
    'kind' in adapterCause &&
    adapterCause.kind === 'postgres' &&
    'code' in adapterCause &&
    typeof adapterCause.code === 'string'
  ) {
    return adapterCause.code;
  }
  return undefined;
}

/** Identifies Prisma and PostgreSQL foreign-key violations. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    isPrismaKnownError(error) &&
    (error.code === 'P2003' || error.code === 'P3003' || getPostgresCode(error) === '23503')
  );
}

/** Returns the final non-empty line from a Prisma or adapter error message. */
export function getPrismaReason(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return '';
  }
  const message = error.message;
  if (typeof message !== 'string') {
    return '';
  }

  return (
    message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? ''
  );
}

/** Translates only unique-constraint errors; unrelated failures continue to the caller. */
export function throwConflictOnDuplicate(
  error: unknown,
  response: { code: string; message: string },
): void {
  if (isPrismaKnownError(error) && error.code === 'P2002') {
    throw new ConflictException(response);
  }
}

/** Translates a missing-record Prisma error while leaving unrelated failures untouched. */
export function throwNotFoundOnMissing(error: unknown): void {
  if (isPrismaKnownError(error) && error.code === 'P2025') {
    throw new NotFoundException(API_ERROR.NOT_FOUND);
  }
}

/** Maps common Prisma constraint failures to safe API exceptions. */
export function mapPrismaError(error: unknown): HttpException | undefined {
  if (!isPrismaKnownError(error)) {
    return undefined;
  }

  switch (error.code) {
    case 'P2002':
      return new ConflictException(API_ERROR.CONFLICT);
    case 'P2003':
      return new ConflictException(API_ERROR.RELATED_DATA_CONFLICT);
    case 'P2025':
      return new NotFoundException(API_ERROR.NOT_FOUND);
    default:
      return undefined;
  }
}
