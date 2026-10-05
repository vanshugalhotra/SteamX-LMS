import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('applies defaults and transforms environment values', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      PORT: '4300',
      CORS_ORIGINS: 'http://localhost:5173, https://steamx.example',
    });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4300,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      MAX_DB_TIMEOUT: 5_000,
      MAX_DB_CONNECTIONS: 20,
      CORS_ORIGINS: ['http://localhost:5173', 'https://steamx.example'],
      SWAGGER_ENABLED: true,
    });
  });

  it('parses false as false and disables Swagger outside development', () => {
    expect(
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
        SWAGGER_ENABLED: 'false',
      }).SWAGGER_ENABLED,
    ).toBe(false);

    expect(
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('accepts silent logging', () => {
    expect(
      validateEnv({
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
        MAX_DB_TIMEOUT: '0',
        MAX_DB_CONNECTIONS: 'not-a-number',
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
    expect(message).toContain('MAX_DB_TIMEOUT');
    expect(message).toContain('MAX_DB_CONNECTIONS');
    expect(message).not.toContain(sensitiveValue);
  });
});
