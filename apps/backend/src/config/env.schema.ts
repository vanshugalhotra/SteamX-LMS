/** Defines and validates the typed environment configuration used by the backend. */
import { z } from 'zod';

const AUTH_TOKEN_TTL_MIN_SECONDS = 60;
const AUTH_TOKEN_TTL_DEFAULT_SECONDS = 86_400;
// Upload links expire after this time; cleanup waits this long plus a five-minute grace period.
const DEFAULT_UPLOAD_URL_TTL_SECONDS = 900;
const MAX_UPLOAD_URL_TTL_SECONDS = 3600;
// The cleanup worker waits this long between runs.
const DEFAULT_CLEANUP_INTERVAL_SECONDS = 300;
const MIN_CLEANUP_INTERVAL_SECONDS = 10;
// Maximum queue page size and ghost assets handled by one run.
const DEFAULT_CLEANUP_BATCH_SIZE = 50;
// Non-READY asset files older than this are treated as abandoned.
const DEFAULT_ASSET_STALE_FILE_AFTER_HOURS = 24;

const DEFAULT_ASSET_MAX_BYTES_IMAGE = 10 * 1024 * 1024;
const DEFAULT_ASSET_MAX_BYTES_PDF = 50 * 1024 * 1024;
const DEFAULT_ASSET_MAX_BYTES_VIDEO = 1024 * 1024 * 1024;
const MAX_ASSET_ACCESS_TTL_SECONDS = 12 * 60 * 60;

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
    // How long a client can use an upload link. Cleanup adds a five-minute safety buffer.
    UPLOAD_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_UPLOAD_URL_TTL_SECONDS, {
        error: `must not exceed ${MAX_UPLOAD_URL_TTL_SECONDS} seconds`,
      })
      .default(DEFAULT_UPLOAD_URL_TTL_SECONDS),
    // Turn the in-process cleanup timer on or off.
    CLEANUP_ENABLED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(true),
    // Time between cleanup runs; the first run starts after this delay.
    CLEANUP_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(MIN_CLEANUP_INTERVAL_SECONDS, {
        error: `must be at least ${MIN_CLEANUP_INTERVAL_SECONDS}`,
      })
      .default(DEFAULT_CLEANUP_INTERVAL_SECONDS),
    // Items per queue page and maximum ghost assets removed in one run.
    CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).default(DEFAULT_CLEANUP_BATCH_SIZE),
    // Age after which a non-READY file can be removed as abandoned.
    ASSET_STALE_FILE_AFTER_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .default(DEFAULT_ASSET_STALE_FILE_AFTER_HOURS),
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
    ASSET_ACCESS_TTL_IMAGE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ASSET_ACCESS_TTL_SECONDS, {
        error: `must not exceed ${MAX_ASSET_ACCESS_TTL_SECONDS} seconds`,
      })
      .default(600),
    ASSET_ACCESS_TTL_PDF_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ASSET_ACCESS_TTL_SECONDS, {
        error: `must not exceed ${MAX_ASSET_ACCESS_TTL_SECONDS} seconds`,
      })
      .default(1800),
    ASSET_ACCESS_TTL_VIDEO_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ASSET_ACCESS_TTL_SECONDS, {
        error: `must not exceed ${MAX_ASSET_ACCESS_TTL_SECONDS} seconds`,
      })
      .default(7200),
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
    cleanup: {
      enabled: env.CLEANUP_ENABLED,
      intervalSeconds: env.CLEANUP_INTERVAL_SECONDS,
      batchSize: env.CLEANUP_BATCH_SIZE,
      assetStaleFileAfterHours: env.ASSET_STALE_FILE_AFTER_HOURS,
    },
    assetLimits: {
      image: env.ASSET_MAX_BYTES_IMAGE,
      pdf: env.ASSET_MAX_BYTES_PDF,
      video: env.ASSET_MAX_BYTES_VIDEO,
    },
    assetAccess: {
      imageTtlSeconds: env.ASSET_ACCESS_TTL_IMAGE_SECONDS,
      pdfTtlSeconds: env.ASSET_ACCESS_TTL_PDF_SECONDS,
      videoTtlSeconds: env.ASSET_ACCESS_TTL_VIDEO_SECONDS,
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
