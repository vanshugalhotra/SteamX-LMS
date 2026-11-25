import type { EnvConfig } from './types.js';

const APP_ORIGIN = 'https://version26.in';
const LOCAL_DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

export const stagingConfig: EnvConfig = {
  envName: 'staging',
  region: 'ap-south-1',
  monthlyBudgetUsd: 25,
  appOrigin: APP_ORIGIN,
  localDevCorsOrigins: LOCAL_DEV_CORS_ORIGINS,
  dbInstanceType: 't4g.micro',
  dbBackupRetentionDays: 1,
  dbMaxAllocatedStorageGb: 25,
  protectData: false,
};
