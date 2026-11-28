import type { EnvConfig } from './types.js';

export interface LoadedEnvironment {
  config: EnvConfig;
  budgetEmail: string;
}

export function loadEnvironmentConfig(
  config: EnvConfig,
  context: { env?: unknown; region?: unknown },
  environment: NodeJS.ProcessEnv,
): LoadedEnvironment {
  const envName = context.env === undefined ? config.envName : String(context.env);
  if (envName !== config.envName) {
    throw new Error(`Unknown environment "${envName}"; only ${config.envName} is defined.`);
  }

  const budgetEmail = environment.STEAMX_BUDGET_EMAIL?.trim();
  if (!budgetEmail) {
    throw new Error('STEAMX_BUDGET_EMAIL is required to synthesize the Foundation stack.');
  }

  const contextRegion = context.region === undefined ? undefined : String(context.region).trim();

  return {
    config: {
      ...config,
      region: contextRegion || environment.AWS_REGION || config.region,
    },
    budgetEmail,
  };
}
