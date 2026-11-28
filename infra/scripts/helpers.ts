/** Shared helpers for lifecycle scripts. */
import { execSync, type ExecSyncOptionsWithBufferEncoding } from 'node:child_process';
import { createInterface } from 'node:readline';
import { stagingConfig } from '../lib/environments/staging.js';
import type { EnvConfig } from '../lib/environments/types.js';

export function getConfig(): EnvConfig {
  return stagingConfig;
}

export function stackPrefix(config: EnvConfig): string {
  return `Steamx${config.envName[0]!.toUpperCase()}${config.envName.slice(1)}`;
}

export function run(
  command: string,
  options?: ExecSyncOptionsWithBufferEncoding & { silent?: boolean },
): string {
  const { silent, ...opts } = options ?? {};
  if (!silent) {
    console.log(`$ ${command}`);
  }
  const result = execSync(command, {
    encoding: 'utf-8',
    stdio: silent ? 'pipe' : 'inherit',
    ...opts,
  });
  return typeof result === 'string' ? result : '';
}

export function runCapture(command: string): string {
  return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

export function verifyAccount(config: EnvConfig): void {
  let identity: { Account?: string };
  try {
    identity = JSON.parse(runCapture('aws sts get-caller-identity'));
  } catch {
    throw new Error('Failed to call aws sts get-caller-identity. Are AWS credentials configured?');
  }
  if (identity.Account !== config.account) {
    throw new Error(
      `AWS account mismatch: expected ${config.account}, got ${identity.Account}. ` +
        'Are you using the right AWS profile?',
    );
  }
  console.log(`✓ Verified AWS account ${config.account}`);
}

export async function promptHidden(prompt: string): Promise<string> {
  // On Windows, we can use a simple readline approach
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function promptConfirmation(phrase: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Type "${phrase}" to confirm: `, resolve);
  });
  rl.close();
  if (answer.trim() !== phrase) {
    throw new Error('Confirmation phrase did not match. Aborting.');
  }
}

export function getGitShortSha(): string {
  return runCapture('git rev-parse --short HEAD');
}

export function isRdsStopped(config: EnvConfig): boolean {
  try {
    const result = runCapture(
      `aws rds describe-db-instances --db-instance-identifier steamx --region ${config.region} --query "DBInstances[0].DBInstanceStatus" --output text`,
    );
    return result === 'stopped';
  } catch {
    return false;
  }
}

export function rdsExists(config: EnvConfig): boolean {
  try {
    runCapture(
      `aws rds describe-db-instances --db-instance-identifier steamx --region ${config.region} --query "DBInstances[0].DBInstanceIdentifier" --output text`,
    );
    return true;
  } catch {
    return false;
  }
}

export function startRdsAndWait(config: EnvConfig): void {
  console.log('Starting RDS instance...');
  run(`aws rds start-db-instance --db-instance-identifier steamx --region ${config.region}`);
  console.log('Waiting for RDS to become available (this can take several minutes)...');
  run(
    `aws rds wait db-instance-available --db-instance-identifier steamx --region ${config.region}`,
  );
  console.log('✓ RDS is available.');
}

export function stopRds(config: EnvConfig): void {
  if (!rdsExists(config)) {
    console.log('RDS instance does not exist; skipping stop.');
    return;
  }
  if (isRdsStopped(config)) {
    console.log('RDS is already stopped.');
    return;
  }
  console.log('Stopping RDS instance...');
  run(`aws rds stop-db-instance --db-instance-identifier steamx --region ${config.region}`);
  console.log('✓ RDS stop initiated.');
}

export function ecsServiceExists(config: EnvConfig): boolean {
  try {
    const result = runCapture(
      `aws ecs describe-services --cluster steamx-${config.envName} --services api --region ${config.region} --query "services[?status=='ACTIVE']|length(@)" --output text`,
    );
    return result !== '0' && result !== '';
  } catch {
    return false;
  }
}

export function appStackExists(config: EnvConfig): boolean {
  const prefix = stackPrefix(config);
  try {
    const status = runCapture(
      `aws cloudformation describe-stacks --stack-name ${prefix}App --region ${config.region} --query "Stacks[0].StackStatus" --output text`,
    );
    return !status.includes('DELETE_COMPLETE');
  } catch {
    return false;
  }
}
