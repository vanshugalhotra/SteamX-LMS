import { Prisma } from '../../generated/prisma/client.js';
import {
  getPostgresCode,
  getPrismaReason,
  isForeignKeyViolation,
  isPrismaKnownError,
  mapPrismaError,
  throwConflictOnDuplicate,
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
  it('throws the configured conflict response for duplicate errors', () => {
    expect(() =>
      throwConflictOnDuplicate(createPrismaError('P2002'), {
        code: 'SCHOOL_CODE_EXISTS',
        message: 'School code already exists',
      }),
    ).toThrow(
      expect.objectContaining({
        response: {
          code: 'SCHOOL_CODE_EXISTS',
          message: 'School code already exists',
        },
        status: 409,
      }),
    );
  });

  it('does not throw for Prisma errors that are not duplicates', () => {
    expect(() =>
      throwConflictOnDuplicate(createPrismaError('P2025'), {
        code: 'SCHOOL_CODE_EXISTS',
        message: 'School code already exists',
      }),
    ).not.toThrow();
  });

  it.each([
    ['P2002', 409, { code: 'CONFLICT', message: 'Resource already exists' }],
    [
      'P2003',
      409,
      { code: 'RELATED_DATA_CONFLICT', message: 'Operation conflicts with related data' },
    ],
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

  it('reads PostgreSQL codes from adapter errors thrown at transaction commit', () => {
    expect(
      getPostgresCode({
        name: 'DriverAdapterError',
        cause: {
          kind: 'postgres',
          code: '23P01',
          message: 'conflicting key value violates exclusion constraint',
        },
      }),
    ).toBe('23P01');
  });

  it.each(['P2003', 'P3003'])('recognizes Prisma foreign-key error %s', (code) => {
    expect(isForeignKeyViolation(createPrismaError(code))).toBe(true);
  });

  it('recognizes PostgreSQL foreign-key errors from adapter metadata', () => {
    expect(
      isForeignKeyViolation(
        createPrismaError('P2010', {
          driverAdapterError: { cause: { originalCode: '23503' } },
        }),
      ),
    ).toBe(true);
    expect(isForeignKeyViolation(createPrismaError('P2010'))).toBe(false);
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
