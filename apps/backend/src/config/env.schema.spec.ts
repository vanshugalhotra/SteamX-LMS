import { validateEnv } from './env.schema.js';

const VALID_SECRET = 'test-auth-secret-with-at-least-thirty-two-characters';

describe('validateEnv', () => {
  it('applies defaults and transforms environment values', () => {
    const env = validateEnv({
      AUTH_JWT_SECRET: VALID_SECRET,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      PORT: '4300',
      CORS_ORIGINS: 'http://localhost:5173, https://steamx.example',
    });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4300,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      DB_POOL_MAX: 10,
      DB_CONNECTION_TIMEOUT_MS: 5_000,
      AUTH_JWT_SECRET: VALID_SECRET,
      AUTH_TOKEN_TTL_SECONDS: 86_400,
      CORS_ORIGINS: ['http://localhost:5173', 'https://steamx.example'],
      SWAGGER_ENABLED: true,
    });
  });

  it('parses configured database pool values', () => {
    const env = validateEnv({
      AUTH_JWT_SECRET: VALID_SECRET,
      DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      DB_POOL_MAX: '25',
      DB_CONNECTION_TIMEOUT_MS: '8000',
    });

    expect(env.DB_POOL_MAX).toBe(25);
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(8_000);
  });

  it('parses false as false and disables Swagger outside development', () => {
    expect(
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
        CORS_ORIGINS: 'https://steamx.example',
        SWAGGER_ENABLED: 'false',
      }).SWAGGER_ENABLED,
    ).toBe(false);

    expect(
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('requires at least one CORS origin in production', () => {
    expect(() =>
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/steamx_lms',
      }),
    ).toThrow('- CORS_ORIGINS: must contain at least one allowed origin in production');

    expect(
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_lms',
      }).CORS_ORIGINS,
    ).toEqual([]);
  });

  it('accepts silent logging', () => {
    expect(
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: '******localhost:5432/steamx_lms',
        LOG_LEVEL: 'silent',
      }).LOG_LEVEL,
    ).toBe('silent');
  });

  it('reports every invalid or missing variable without exposing values', () => {
    const sensitiveValue = 'private-environment-value';
    let message = '';

    try {
      validateEnv({
        NODE_ENV: 'invalid',
        PORT: 'not-a-number',
        LOG_LEVEL: 'verbose',
        CORS_ORIGINS: sensitiveValue,
        SWAGGER_ENABLED: 'yes',
        DB_POOL_MAX: '51',
        DB_CONNECTION_TIMEOUT_MS: '999',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('CORS_ORIGINS');
    expect(message).toContain('SWAGGER_ENABLED');
    expect(message).toContain('DB_POOL_MAX');
    expect(message).toContain('DB_CONNECTION_TIMEOUT_MS');
    expect(message).toContain('AUTH_JWT_SECRET');
    expect(message).not.toContain(sensitiveValue);
  });

  it('rejects a missing auth secret', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost/steamx_test',
      }),
    ).toThrow('- AUTH_JWT_SECRET: is required');
  });

  it('rejects a short auth secret without exposing its value', () => {
    const shortSecret = 'short-secret';
    let message = '';

    try {
      validateEnv({
        AUTH_JWT_SECRET: shortSecret,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('- AUTH_JWT_SECRET: must be at least 32 characters');
    expect(message).not.toContain(shortSecret);
  });

  it('defaults auth token lifetime to one day', () => {
    expect(
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
      }).AUTH_TOKEN_TTL_SECONDS,
    ).toBe(86_400);
  });
});
