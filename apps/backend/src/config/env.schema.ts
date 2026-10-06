import { z } from 'zod';

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
