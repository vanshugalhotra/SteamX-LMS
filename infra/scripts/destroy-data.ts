/** staging:destroy-data — Destroy the Foundation stack (deletes database, buckets, secrets). */
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

  console.log('⚠️  This will PERMANENTLY DELETE:');
  console.log('  - The RDS database and all data');
  console.log('  - S3 buckets (media and uploads) and all objects');
  console.log('  - ECR repository and all images');
  console.log('  - Secrets Manager secrets');
  console.log('  - VPC and all networking resources\n');

  await promptConfirmation('destroy staging data');

  // Delete IAM access keys of the local-dev user (CloudFormation cannot delete a user with keys)
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

  console.log('\n✓ Foundation stack destroyed. Only the Cert stack remains.');
}

export { main as destroyData };

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
