import { RemovalPolicy } from 'aws-cdk-lib';

const DEFAULT_BUDGET_AMOUNT = 25;
const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

export interface InfrastructureConfig {
  environmentName: string;
  region: string;
  budgetEmail: string;
  budgetAmount: number;
  corsOrigins: string[];
  bucketRemovalPolicy: RemovalPolicy;
  autoDeleteObjects: boolean;
  terminationProtection: boolean;
}

export function getInfrastructureConfig(
  environmentName: string,
  environment: NodeJS.ProcessEnv,
  region: string,
): InfrastructureConfig {
  if (!/^[a-z][a-z0-9-]*$/.test(environmentName)) {
    throw new Error(
      'CDK context "env" must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens.',
    );
  }

  const budgetEmail = environment.STEAMX_BUDGET_EMAIL?.trim();
  if (!budgetEmail) {
    throw new Error('STEAMX_BUDGET_EMAIL is required to synthesize the infrastructure stack.');
  }

  const corsOrigins = environment.STEAMX_CORS_ORIGINS
    ? environment.STEAMX_CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_CORS_ORIGINS;

  if (corsOrigins.length === 0) {
    throw new Error('STEAMX_CORS_ORIGINS must contain at least one comma-separated origin.');
  }

  const isStaging = environmentName === 'staging';

  return {
    environmentName,
    region,
    budgetEmail,
    budgetAmount: DEFAULT_BUDGET_AMOUNT,
    corsOrigins,
    bucketRemovalPolicy: isStaging ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    autoDeleteObjects: isStaging,
    terminationProtection: !isStaging,
  };
}
