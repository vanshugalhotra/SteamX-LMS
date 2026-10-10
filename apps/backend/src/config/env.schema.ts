import { z } from 'zod';

const AUTH_TOKEN_TTL_MIN_SECONDS = 60;
const AUTH_TOKEN_TTL_DEFAULT_SECONDS = 86_400;

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
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'must contain at least one allowed origin in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV === 'development',
  }));

export type Env = z.output<typeof envSchema>;

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
