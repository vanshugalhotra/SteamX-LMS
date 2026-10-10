import { ForbiddenException, Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = new Set(config.get('CORS_ORIGINS', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!STATE_CHANGING_METHODS.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin.length === 0 || origin === 'null') {
      this.rejectOrigin();
    }

    let parsedOrigin: string;
    try {
      parsedOrigin = new URL(origin).origin;
    } catch {
      this.rejectOrigin();
    }

    if (!this.allowedOrigins.has(parsedOrigin)) {
      this.rejectOrigin();
    }

    return true;
  }

  private rejectOrigin(): never {
    throw new ForbiddenException({
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origin not allowed',
    });
  }
}
