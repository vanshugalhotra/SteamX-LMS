/** Defines and validates the typed environment configuration used by the backend. */
import { z } from 'zod';

const AUTH_TOKEN_TTL_MIN_SECONDS = 60;
const AUTH_TOKEN_TTL_DEFAULT_SECONDS = 86_400;
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 900;
const DEFAULT_ASSET_MAX_BYTES_IMAGE = 10 * 1024 * 1024;
const DEFAULT_ASSET_MAX_BYTES_PDF = 50 * 1024 * 1024;
const DEFAULT_ASSET_MAX_BYTES_VIDEO = 1024 * 1024 * 1024;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string({ error: 'is required' }).min(1, { error: 'is required' }),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
    AUTH_JWT_SECRET: z
      .string({ error: 'is required' })
      .min(32, { error: 'must be at least 32 characters' }),
    AUTH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(AUTH_TOKEN_TTL_MIN_SECONDS, {
        error: `must be at least ${AUTH_TOKEN_TTL_MIN_SECONDS}`,
      })
      .default(AUTH_TOKEN_TTL_DEFAULT_SECONDS),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((origins) =>
        origins
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(z.url({ error: 'must be a valid URL' }))),
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    AWS_REGION: z.string({ error: 'is required' }).min(1, { error: 'is required' }),
    S3_BUCKET: z.string({ error: 'is required' }).min(1, { error: 'is required' }),
    AWS_ACCESS_KEY_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    AWS_SECRET_ACCESS_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    UPLOAD_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_UPLOAD_URL_TTL_SECONDS),
    ASSET_MAX_BYTES_IMAGE: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_ASSET_MAX_BYTES_IMAGE),
    ASSET_MAX_BYTES_PDF: z.coerce.number().int().positive().default(DEFAULT_ASSET_MAX_BYTES_PDF),
    ASSET_MAX_BYTES_VIDEO: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_ASSET_MAX_BYTES_VIDEO),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'must contain at least one allowed origin in production',
      });
    }

    if (Boolean(env.AWS_ACCESS_KEY_ID) !== Boolean(env.AWS_SECRET_ACCESS_KEY)) {
      context.addIssue({
        code: 'custom',
        path: ['AWS_ACCESS_KEY_ID'],
        message: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set or both be omitted',
      });
    }
  })
  .transform((env) => ({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    LOG_LEVEL: env.LOG_LEVEL,
    DATABASE_URL: env.DATABASE_URL,
    DB_POOL_MAX: env.DB_POOL_MAX,
    DB_CONNECTION_TIMEOUT_MS: env.DB_CONNECTION_TIMEOUT_MS,
    AUTH_JWT_SECRET: env.AUTH_JWT_SECRET,
    AUTH_TOKEN_TTL_SECONDS: env.AUTH_TOKEN_TTL_SECONDS,
    CORS_ORIGINS: env.CORS_ORIGINS,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV === 'development',
    storage: {
      region: env.AWS_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      uploadUrlTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
    },
    assetLimits: {
      image: env.ASSET_MAX_BYTES_IMAGE,
      pdf: env.ASSET_MAX_BYTES_PDF,
      video: env.ASSET_MAX_BYTES_VIDEO,
    },
  }));

export type Env = z.output<typeof envSchema>;

/** Validates all runtime configuration once, before services read typed values. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const variable = typeof issue.path[0] === 'string' ? issue.path[0] : 'environment';
      return `- ${variable}: ${issue.message}`;
    });

    throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
  }

  return result.data;
}
