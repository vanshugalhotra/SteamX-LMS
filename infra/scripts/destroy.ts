/** staging:destroy — Destroy the App stack and stop RDS. */
import { getConfig, promptConfirmation, run, stackPrefix, stopRds } from './helpers.js';

async function main(): Promise<void> {
  const config = getConfig();

  const prefix = stackPrefix(config);
  const appStack = `${prefix}App`;

  console.log('This will:');
  console.log(`  1. Run cdk destroy ${appStack} --exclusively`);
  console.log('  2. Stop RDS');
  console.log(`  Region: ${config.region}\n`);

  await promptConfirmation(`destroy ${config.envName} app`);

  run(`pnpm exec cdk destroy ${appStack} --exclusively --force`);
  stopRds(config);

  console.log(
    '\n✓ App stack destroyed, RDS stopped. Ongoing costs: RDS stopped storage, S3, CloudFront, Foundation resources.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
