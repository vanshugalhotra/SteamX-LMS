import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { API_ERROR } from './api-errors.js';

type PrismaKnownError = {
  name: 'PrismaClientKnownRequestError';
  code: string;
  message?: unknown;
  meta?: unknown;
};

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

export function getPostgresCode(error: PrismaKnownError): string | undefined {
  if (
    typeof error.meta !== 'object' ||
    error.meta === null ||
    !('driverAdapterError' in error.meta)
  ) {
    return undefined;
  }

  const driverAdapterError = error.meta.driverAdapterError;
  if (
    typeof driverAdapterError !== 'object' ||
    driverAdapterError === null ||
    !('cause' in driverAdapterError)
  ) {
    return undefined;
  }

  const cause = driverAdapterError.cause;
  if (typeof cause !== 'object' || cause === null || !('originalCode' in cause)) {
    return undefined;
  }

  return typeof cause.originalCode === 'string' ? cause.originalCode : undefined;
}

export function getPrismaReason(error: PrismaKnownError): string {
  if (typeof error.message !== 'string') {
    return '';
  }

  return (
    error.message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? ''
  );
}

export function throwConflictOnDuplicate(
  error: unknown,
  response: { code: string; message: string },
): void {
  if (isPrismaKnownError(error) && error.code === 'P2002') {
    throw new ConflictException(response);
  }
}

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
