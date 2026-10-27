/** Normalizes framework, middleware, and persistence errors into the API response envelope. */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { mapPrismaError } from '../errors/prisma-error.js';
import { API_ERROR, HTTP_ERROR_CODES } from '../errors/api-errors.js';

type ExceptionResponse = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

/** Keeps framework and middleware exceptions inside the API's stable error envelope. */
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
    return API_ERROR.INTERNAL_ERROR.message;
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
    return API_ERROR.INTERNAL_ERROR.code;
  }
  if (typeof exceptionResponse?.code === 'string') {
    return exceptionResponse.code;
  }

  return HTTP_ERROR_CODES[statusCode] ?? API_ERROR.HTTP_ERROR.code;
}

/** Maps the exception to the public status, code, safe message, and request ID. */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  /** Logs unexpected server errors internally while withholding details from clients. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const requestId = request.id ?? randomUUID();
    const error = mapPrismaError(exception) ?? exception;
    const statusCode = getStatusCode(error);
    const exceptionResponse = getExceptionResponse(error);
    const isServerError = statusCode >= 500;

    if (isServerError) {
      const originalError = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error({
        err: originalError,
        requestId,
        msg: 'Unhandled request error',
      });
    }

    response.status(statusCode).json({
      statusCode,
      code: getCode(exceptionResponse, statusCode),
      message: getMessage(error, exceptionResponse, statusCode),
      ...(statusCode < 500 &&
        exceptionResponse?.details !== undefined && { details: exceptionResponse.details }),
      requestId,
    });
  }
}
