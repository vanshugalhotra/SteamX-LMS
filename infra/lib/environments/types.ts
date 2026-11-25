export interface EnvConfig {
  envName: 'staging';
  region: string;
  monthlyBudgetUsd: number;
  domainName: string;
  appOrigin: string;
  localDevCorsOrigins: string[];
  dbInstanceType: string;
  dbBackupRetentionDays: number;
  dbMaxAllocatedStorageGb: number;
  protectData: boolean;
}
