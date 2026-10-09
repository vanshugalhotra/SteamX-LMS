import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { validateEnv } from '../config/env.schema.js';
import { TokenService } from './token.service.js';

const DATABASE_URL = 'postgresql://localhost/steamx_test';
const JWT_SECRET = 'test-auth-secret-with-at-least-thirty-two-characters';
const TOKEN_TTL_SECONDS = 300;

function createTokenService(nodeEnv: Env['NODE_ENV'] = 'test', secret = JWT_SECRET): TokenService {
  const env = validateEnv({
    DATABASE_URL,
    NODE_ENV: nodeEnv,
    AUTH_JWT_SECRET: secret,
    AUTH_TOKEN_TTL_SECONDS: TOKEN_TTL_SECONDS,
  });

  return new TokenService(new ConfigService<Env, true>(env));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TokenService', () => {
  it('signs and verifies only the subject and fixed lifetime claims', async () => {
    vi.useFakeTimers();
    const service = createTokenService();

    const token = await service.sign('user-123');
    const verified = await service.verify(token);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { sub: string; iat: number; exp: number };

    expect(verified).toEqual({
      userId: 'user-123',
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    });
    expect(payload).toEqual({
      sub: 'user-123',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    expect(payload.exp - payload.iat).toBe(TOKEN_TTL_SECONDS);
  });

  it('rejects a tampered token', async () => {
    const service = createTokenService();
    const token = await service.sign('user-123');
    const [header, encodedPayload, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload ?? '', 'base64url').toString('utf8')) as {
      sub: string;
      iat: number;
      exp: number;
    };
    const changedPayload = Buffer.from(JSON.stringify({ ...payload, sub: 'user-456' })).toString(
      'base64url',
    );

    await expect(service.verify(`${header}.${changedPayload}.${signature}`)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const signer = createTokenService('test', 'different-auth-secret-with-at-least-32-chars');
    const verifier = createTokenService();
    const token = await signer.sign('user-123');

    await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unsecured token', async () => {
    const service = createTokenService();
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const issuedAt = Math.floor(Date.now() / 1_000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-123',
        iat: issuedAt,
        exp: issuedAt + TOKEN_TTL_SECONDS,
      }),
    ).toString('base64url');

    await expect(service.verify(`${header}.${payload}.`)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with a different algorithm', async () => {
    const service = createTokenService();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS384' })
      .setSubject('user-123')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1_000) + TOKEN_TTL_SECONDS)
      .sign(new TextEncoder().encode(JWT_SECRET));

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signed token with an extra school claim', async () => {
    const service = createTokenService();
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({ schoolId: 'school-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + TOKEN_TTL_SECONDS)
      .sign(new TextEncoder().encode(JWT_SECRET));

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signed token without an expiration claim', async () => {
    const service = createTokenService();
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-123')
      .setIssuedAt(issuedAt)
      .sign(new TextEncoder().encode(JWT_SECRET));

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signed token with an empty subject', async () => {
    const service = createTokenService();
    const issuedAt = Math.floor(Date.now() / 1_000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + TOKEN_TTL_SECONDS)
      .sign(new TextEncoder().encode(JWT_SECRET));

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    vi.useFakeTimers();
    const service = createTokenService();
    const token = await service.sign('user-123');

    vi.advanceTimersByTime((TOKEN_TTL_SECONDS + 1) * 1_000);

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('sets cookie security according to NODE_ENV', () => {
    expect(createTokenService('production').cookieOptions()).toEqual({
      name: 'steamx_session',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS * 1_000,
    });
    expect(createTokenService('development').cookieOptions().secure).toBe(false);
  });
});
