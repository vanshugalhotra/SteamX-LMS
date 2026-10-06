import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { mapPrismaError } from '../errors/prisma-error.js';

const HTTP_ERROR_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

type ExceptionResponse = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

function getStatusCode(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  // Express middleware errors (e.g. body-parser 413) are marked `expose: true` for 4xx.
  if (typeof exception === 'object' && exception !== null && 'expose' in exception) {
    const { expose } = exception;
    const status =
      'status' in exception
        ? exception.status
        : 'statusCode' in exception
          ? exception.statusCode
          : undefined;
    if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
      return status;
    }
  }

  return 500;
}

function getExceptionResponse(exception: unknown): ExceptionResponse | undefined {
  if (!(exception instanceof HttpException)) {
    return undefined;
  }

  const exceptionResponse = exception.getResponse();
  if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
    return undefined;
  }

  return exceptionResponse as ExceptionResponse;
}

function getMessage(
  exception: unknown,
  exceptionResponse: ExceptionResponse | undefined,
  statusCode: number,
): string {
  if (statusCode >= 500) {
    return 'Internal server error';
  }
  if (typeof exceptionResponse?.message === 'string') {
    return exceptionResponse.message;
  }
  if (Array.isArray(exceptionResponse?.message)) {
    return exceptionResponse.message.join(', ');
  }
  if (exception instanceof HttpException) {
    return exception.message;
  }

  return 'Request failed';
}

function getCode(exceptionResponse: ExceptionResponse | undefined, statusCode: number): string {
  if (statusCode >= 500) {
    return 'INTERNAL_ERROR';
  }
  if (typeof exceptionResponse?.code === 'string') {
    return exceptionResponse.code;
  }

  return HTTP_ERROR_CODES[statusCode] ?? 'HTTP_ERROR';
}

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const error = mapPrismaError(exception) ?? exception;
    const statusCode = getStatusCode(error);
    const exceptionResponse = getExceptionResponse(error);
    const isServerError = statusCode >= 500;

    if (isServerError) {
      const originalError = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({
        err: originalError,
        requestId: request.id,
        msg: 'Unhandled request error',
      });
    }

    response.status(statusCode).json({
      statusCode,
      code: getCode(exceptionResponse, statusCode),
      message: getMessage(error, exceptionResponse, statusCode),
      ...(statusCode < 500 &&
        exceptionResponse?.details !== undefined && { details: exceptionResponse.details }),
      requestId: request.id,
    });
  }
}
