import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config/env.schema.js';

const AUTH_COOKIE_NAME = 'steamx_session';
const JWT_ALGORITHM = 'HS256';
const JWT_ALGORITHMS = [JWT_ALGORITHM];
const MILLISECONDS_PER_SECOND = 1_000;
const INVALID_TOKEN_MESSAGE = 'Invalid or expired authentication token';

export type VerifiedToken = {
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AuthCookieOptions = {
  name: typeof AUTH_COOKIE_NAME;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly ttlSeconds: number;
  private readonly isProduction: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.secret = new TextEncoder().encode(config.get('AUTH_JWT_SECRET', { infer: true }));
    this.ttlSeconds = config.get('AUTH_TOKEN_TTL_SECONDS', { infer: true });
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  async sign(userId: string): Promise<string> {
    const issuedAt = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
    const expiresAt = issuedAt + this.ttlSeconds;

    return new SignJWT({})
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.secret);
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: JWT_ALGORITHMS,
      });
      const claimNames = Object.keys(payload).sort();

      if (
        claimNames.length !== 3 ||
        claimNames[0] !== 'exp' ||
        claimNames[1] !== 'iat' ||
        claimNames[2] !== 'sub' ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        typeof payload.iat !== 'number' ||
        !Number.isInteger(payload.iat) ||
        typeof payload.exp !== 'number' ||
        !Number.isInteger(payload.exp)
      ) {
        throw new Error(INVALID_TOKEN_MESSAGE);
      }

      return {
        userId: payload.sub,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      };
    } catch {
      throw new UnauthorizedException(INVALID_TOKEN_MESSAGE);
    }
  }

  cookieOptions(): AuthCookieOptions {
    return {
      name: AUTH_COOKIE_NAME,
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: this.ttlSeconds * MILLISECONDS_PER_SECOND,
    };
  }
}
