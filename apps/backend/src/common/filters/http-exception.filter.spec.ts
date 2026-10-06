import { ArgumentsHost } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  it('maps Prisma unique constraint errors to a generic conflict response', () => {
    const logError = vi.fn();
    const logger = { error: logError } as unknown as Logger;
    const filter = new HttpExceptionFilter(logger);
    const setStatus = vi.fn().mockReturnThis();
    const sendJson = vi.fn();
    const response = {
      headersSent: false,
      status: setStatus,
      json: sendJson,
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'request-id' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.10.0',
      meta: {
        target: ['private_column'],
        constraint: 'private_constraint',
      },
    });

    filter.catch(error, host);

    expect(setStatus).toHaveBeenCalledWith(409);
    expect(sendJson).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Resource already exists',
      requestId: 'request-id',
    });
    expect(JSON.stringify(sendJson.mock.calls)).not.toContain('private_');
    expect(logError).not.toHaveBeenCalled();
  });
});
