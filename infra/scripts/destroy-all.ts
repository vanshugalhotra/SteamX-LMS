/** staging:destroy-all — Destroy everything: Foundation (data) + Cert. */
import {
  appStackExists,
  getConfig,
  promptConfirmation,
  run,
  runCapture,
  stackPrefix,
} from './helpers.js';

async function main(): Promise<void> {
  const config = getConfig();

  if (config.protectData) {
    throw new Error('Cannot destroy data: protectData is true for this environment.');
  }

  const prefix = stackPrefix(config);
  if (appStackExists(config)) {
    throw new Error(
      `The ${prefix}App stack still exists. Run staging:destroy first to remove the App stack.`,
    );
  }

  console.log('⚠️  This will PERMANENTLY DELETE ALL INFRASTRUCTURE:');
  console.log('  - Database, buckets, secrets, ECR, VPC (Foundation)');
  console.log('  - CloudFront certificate (Cert)\n');

  await promptConfirmation('destroy staging data');

  // Delete IAM access keys of the local-dev user
  const userName = `steamx-${config.envName}-local-dev`;
  try {
    const keysJson = runCapture(
      `aws iam list-access-keys --user-name ${userName} --query "AccessKeyMetadata[].AccessKeyId" --output json`,
    );
    const keys = JSON.parse(keysJson) as string[];
    for (const keyId of keys) {
      console.log(`Deleting access key ${keyId} for ${userName}...`);
      run(`aws iam delete-access-key --user-name ${userName} --access-key-id ${keyId}`);
    }
  } catch {
    console.log(`No access keys to delete for ${userName} (or user does not exist).`);
  }

  run(`pnpm exec cdk destroy ${prefix}Foundation --exclusively --force`);
  run(`pnpm exec cdk destroy ${prefix}Cert --exclusively --force`);

  console.log('\n✓ All stacks destroyed.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
