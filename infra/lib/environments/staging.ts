import type { EnvConfig } from './types.js';

const DOMAIN_NAME = 'version26.in';
const LOCAL_DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

export const stagingConfig: EnvConfig = {
  envName: 'staging',
  region: 'ap-south-1',
  monthlyBudgetUsd: 25,
  domainName: DOMAIN_NAME,
  appOrigin: `https://learn.${DOMAIN_NAME}`,
  localDevCorsOrigins: LOCAL_DEV_CORS_ORIGINS,
  dbInstanceType: 't4g.micro',
  dbBackupRetentionDays: 1,
  dbMaxAllocatedStorageGb: 25,
  protectData: false,
};
