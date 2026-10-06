import { Prisma } from '../generated/prisma/client.js';
import { serializeError } from './serialize-error.js';

describe('serializeError', () => {
  it('serializes Prisma errors without a stack trace', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Invalid query invocation:\n\n  canceling statement due to statement timeout',
      {
        code: 'P2010',
        clientVersion: '7.10.0',
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: '57014',
            },
          },
        },
      },
    );

    const serialized = serializeError(error);

    expect(serialized).toEqual({
      type: 'PrismaClientKnownRequestError',
      prismaCode: 'P2010',
      postgresCode: '57014',
      message: 'canceling statement due to statement timeout',
    });
    expect(serialized).not.toHaveProperty('stack');
  });

  it('keeps stack traces for non-Prisma errors', () => {
    const serialized = serializeError(new Error('ordinary error'));

    expect(serialized).toHaveProperty('type', 'Error');
    expect(serialized).toHaveProperty('message', 'ordinary error');
    expect(serialized).toHaveProperty('stack');
  });
});
