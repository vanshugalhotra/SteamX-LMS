export interface EnvConfig {
  envName: string;
  account: string;
  region: string;
  monthlyBudgetUsd: number;
  domainName: string;
  appOrigin: string;
  localDevCorsOrigins: string[];
  apiScaling: {
    minTasks: number;
    maxTasks: number;
    cpuTargetPercent: number;
  };
  dbInstanceType: string;
  dbBackupRetentionDays: number;
  dbMaxAllocatedStorageGb: number;
  protectData: boolean;
}
