import { stagingConfig } from './staging.js';
import type { EnvConfig } from './types.js';

export interface LoadedEnvironment {
  config: EnvConfig;
  account: string | undefined;
  budgetEmail: string;
}

export function loadEnvironmentConfig(
  context: { env?: unknown; region?: unknown },
  environment: NodeJS.ProcessEnv,
): LoadedEnvironment {
  const envName = context.env === undefined ? 'staging' : String(context.env);
  if (envName !== 'staging') {
    throw new Error(`Unknown environment "${envName}"; only staging is defined.`);
  }

  const budgetEmail = environment.STEAMX_BUDGET_EMAIL?.trim();
  if (!budgetEmail) {
    throw new Error('STEAMX_BUDGET_EMAIL is required to synthesize the Base stack.');
  }

  if (
    stagingConfig.domainName !== stagingConfig.domainName.toLowerCase() ||
    stagingConfig.domainName.includes('://') ||
    stagingConfig.domainName.endsWith('.')
  ) {
    throw new Error(
      'The configured domainName must be lowercase, have no scheme, and have no trailing dot.',
    );
  }

  if (!stagingConfig.appOrigin.startsWith('https://') || stagingConfig.appOrigin.endsWith('/')) {
    throw new Error(
      'The configured appOrigin must start with https:// and have no trailing slash.',
    );
  }

  let appOriginHostname: string;
  try {
    appOriginHostname = new URL(stagingConfig.appOrigin).hostname;
  } catch {
    throw new Error('The configured appOrigin must be a valid URL.');
  }

  if (appOriginHostname !== `learn.${stagingConfig.domainName}`) {
    throw new Error(`The configured appOrigin hostname must be learn.${stagingConfig.domainName}.`);
  }

  const contextRegion = context.region === undefined ? undefined : String(context.region).trim();

  return {
    config: {
      ...stagingConfig,
      region: contextRegion || environment.AWS_REGION || stagingConfig.region,
    },
    account: environment.CDK_DEFAULT_ACCOUNT,
    budgetEmail,
  };
}
