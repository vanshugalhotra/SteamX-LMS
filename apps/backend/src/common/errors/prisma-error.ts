import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';

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

export function mapPrismaError(error: unknown): HttpException | undefined {
  if (!isPrismaKnownError(error)) {
    return undefined;
  }

  switch (error.code) {
    case 'P2002':
      return new ConflictException({
        code: 'CONFLICT',
        message: 'Resource already exists',
      });
    case 'P2003':
      return new ConflictException({
        code: 'CONFLICT',
        message: 'Operation conflicts with related data',
      });
    case 'P2025':
      return new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    default:
      return undefined;
  }
}
