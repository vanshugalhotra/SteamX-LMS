import { ArgumentsHost, BadRequestException } from '@nestjs/common';
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

  // Foreign-key and missing-record Prisma errors map to stable API conflict/not-found codes.
  it.each([
    ['P2003', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
  ])('maps Prisma error %s to its safe status and code', (code, statusCode, publicCode) => {
    const { filter, json, status } = createFilter();
    const error = Object.assign(new Error('private relation detail'), {
      name: 'PrismaClientKnownRequestError',
      code,
    });

    filter.catch(error, createHost(json, status));

    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode,
        code: publicCode,
        requestId: 'request-id',
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('private relation detail');
  });

  // Domain errors preserve their public code while keeping the standard response envelope.
  it('preserves a domain error code in the uniform envelope', () => {
    const { filter, json, status } = createFilter();

    filter.catch(
      new BadRequestException({ code: 'FIELD_NOT_APPLICABLE', message: 'Invalid field' }),
      createHost(json, status),
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'FIELD_NOT_APPLICABLE',
      message: 'Invalid field',
      requestId: 'request-id',
    });
  });

  // Unexpected server failures expose neither exception messages nor stack traces to clients.
  it('hides internal details from unexpected errors', () => {
    const { filter, json, status, logError } = createFilter();

    filter.catch(new Error('private database detail'), createHost(json, status));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'request-id',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('private database detail');
    expect(logError).toHaveBeenCalledOnce();
  });
});

function createFilter() {
  const logError = vi.fn();
  const filter = new HttpExceptionFilter({ error: logError } as unknown as Logger);
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();

  return { filter, status, json, logError };
}

function createHost(json: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn>) {
  const response = { headersSent: false, status, json };

  return {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'request-id' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}
