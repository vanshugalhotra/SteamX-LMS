import { validateEnv } from './env.schema.js';

const VALID_SECRET = 'test-auth-secret-with-at-least-thirty-two-characters';
const STORAGE_CONFIG = {
  AWS_REGION: 'ap-south-1',
  S3_BUCKET: 'test-bucket',
};

describe('validateEnv', () => {
  it('applies defaults and transforms environment values', () => {
    const env = validateEnv({
      ...STORAGE_CONFIG,
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
      storage: {
        region: 'ap-south-1',
        bucket: 'test-bucket',
        accessKeyId: undefined,
        secretAccessKey: undefined,
        uploadUrlTtlSeconds: 900,
      },
      assetLimits: {
        image: 10 * 1024 * 1024,
        pdf: 50 * 1024 * 1024,
        video: 1024 * 1024 * 1024,
      },
      assetAccess: {
        imageTtlSeconds: 600,
        pdfTtlSeconds: 1800,
        videoTtlSeconds: 7200,
      },
    });
  });

  it('parses configured database pool values', () => {
    const env = validateEnv({
      ...STORAGE_CONFIG,
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
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
        CORS_ORIGINS: 'https://steamx.example',
        SWAGGER_ENABLED: 'false',
      }).SWAGGER_ENABLED,
    ).toBe(false);

    expect(
      validateEnv({
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:password@localhost:5432/steamx_lms',
      }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('requires at least one CORS origin in production', () => {
    expect(() =>
      validateEnv({
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/steamx_lms',
      }),
    ).toThrow('- CORS_ORIGINS: must contain at least one allowed origin in production');

    expect(
      validateEnv({
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_lms',
      }).CORS_ORIGINS,
    ).toEqual([]);
  });

  it('accepts silent logging', () => {
    expect(
      validateEnv({
        ...STORAGE_CONFIG,
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
        ...STORAGE_CONFIG,
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
        ...STORAGE_CONFIG,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
      }),
    ).toThrow('- AUTH_JWT_SECRET: is required');
  });

  it('rejects a short auth secret without exposing its value', () => {
    const shortSecret = 'short-secret';
    let message = '';

    try {
      validateEnv({
        ...STORAGE_CONFIG,
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
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
      }).AUTH_TOKEN_TTL_SECONDS,
    ).toBe(86_400);
  });

  it('requires an S3 bucket and AWS region', () => {
    expect(() =>
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
        AWS_REGION: 'ap-south-1',
      }),
    ).toThrow('- S3_BUCKET: is required');

    expect(() =>
      validateEnv({
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
        S3_BUCKET: 'test-bucket',
      }),
    ).toThrow('- AWS_REGION: is required');
  });

  it('requires AWS credentials to be supplied together', () => {
    for (const credentials of [
      { AWS_ACCESS_KEY_ID: 'test-access-key' },
      { AWS_SECRET_ACCESS_KEY: 'test-secret-key' },
    ]) {
      expect(() =>
        validateEnv({
          ...STORAGE_CONFIG,
          ...credentials,
          AUTH_JWT_SECRET: VALID_SECRET,
          DATABASE_URL: 'postgresql://localhost/steamx_test',
        }),
      ).toThrow('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set or both be omitted');
    }
  });

  it.each([
    ['ASSET_ACCESS_TTL_IMAGE_SECONDS', '0'],
    ['ASSET_ACCESS_TTL_IMAGE_SECONDS', '-1'],
    ['ASSET_ACCESS_TTL_IMAGE_SECONDS', '1.5'],
    ['ASSET_ACCESS_TTL_IMAGE_SECONDS', '43201'],
    ['ASSET_ACCESS_TTL_PDF_SECONDS', '0'],
    ['ASSET_ACCESS_TTL_PDF_SECONDS', '-1'],
    ['ASSET_ACCESS_TTL_PDF_SECONDS', '1.5'],
    ['ASSET_ACCESS_TTL_PDF_SECONDS', '43201'],
    ['ASSET_ACCESS_TTL_VIDEO_SECONDS', '0'],
    ['ASSET_ACCESS_TTL_VIDEO_SECONDS', '-1'],
    ['ASSET_ACCESS_TTL_VIDEO_SECONDS', '1.5'],
    ['ASSET_ACCESS_TTL_VIDEO_SECONDS', '43201'],
  ])('rejects invalid %s value %s', (variable, value) => {
    expect(() =>
      validateEnv({
        ...STORAGE_CONFIG,
        AUTH_JWT_SECRET: VALID_SECRET,
        DATABASE_URL: 'postgresql://localhost/steamx_test',
        [variable]: value,
      }),
    ).toThrow(`- ${variable}:`);
  });

  it('accepts the maximum asset access URL TTL', () => {
    const env = validateEnv({
      ...STORAGE_CONFIG,
      AUTH_JWT_SECRET: VALID_SECRET,
      DATABASE_URL: 'postgresql://localhost/steamx_test',
      ASSET_ACCESS_TTL_IMAGE_SECONDS: '43200',
      ASSET_ACCESS_TTL_PDF_SECONDS: '43200',
      ASSET_ACCESS_TTL_VIDEO_SECONDS: '43200',
    });

    expect(env.assetAccess).toEqual({
      imageTtlSeconds: 43_200,
      pdfTtlSeconds: 43_200,
      videoTtlSeconds: 43_200,
    });
  });
});
