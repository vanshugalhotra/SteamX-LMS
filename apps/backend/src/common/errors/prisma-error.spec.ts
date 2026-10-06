import { Prisma } from '../../generated/prisma/client.js';
import {
  getPostgresCode,
  getPrismaReason,
  isPrismaKnownError,
  mapPrismaError,
} from './prisma-error.js';

function createPrismaError(
  code: string,
  meta?: Record<string, unknown>,
  message = 'Prisma error',
): Error {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '7.10.0',
    meta,
  });
}

describe('Prisma error helpers', () => {
  it.each([
    ['P2002', 409, { code: 'CONFLICT', message: 'Resource already exists' }],
    ['P2003', 409, { code: 'CONFLICT', message: 'Operation conflicts with related data' }],
    ['P2025', 404, { code: 'NOT_FOUND', message: 'Resource not found' }],
  ])('maps %s to its generic HTTP response', (code, status, body) => {
    const mapped = mapPrismaError(createPrismaError(code));

    expect(mapped?.getStatus()).toBe(status);
    expect(mapped?.getResponse()).toEqual(body);
  });

  it.each([createPrismaError('P2010'), new Error('ordinary error')])(
    'does not map unknown errors',
    (error) => {
      expect(mapPrismaError(error)).toBeUndefined();
    },
  );

  it('reads PostgreSQL codes from the driver adapter cause', () => {
    const error = createPrismaError('P2010', {
      driverAdapterError: {
        cause: {
          originalCode: '57014',
        },
      },
    });

    expect(isPrismaKnownError(error)).toBe(true);
    if (isPrismaKnownError(error)) {
      expect(getPostgresCode(error)).toBe('57014');
    }
  });

  it('returns the last non-empty trimmed message line', () => {
    const error = createPrismaError(
      'P2010',
      undefined,
      '\nInvalid query invocation:\n\n  canceling statement due to statement timeout \n',
    );

    if (!isPrismaKnownError(error)) {
      throw new Error('Expected a Prisma known error');
    }

    expect(getPrismaReason(error)).toBe('canceling statement due to statement timeout');
  });
});
