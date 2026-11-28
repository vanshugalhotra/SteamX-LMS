/** staging:stop — Scale to zero and stop RDS. */
import { getConfig, run, stackPrefix, stopRds, verifyAccount } from './helpers.js';

async function main(): Promise<void> {
  const config = getConfig();
  verifyAccount(config);

  console.log('This will:');
  console.log('  1. Set ECS autoscaling min/max to 0 and desired count to 0');
  console.log('  2. Stop the RDS instance');
  console.log(`  Region: ${config.region}, Cluster: steamx-${config.envName}\n`);

  const cluster = `steamx-${config.envName}`;

  // Update autoscaling to 0/0
  const resourceId = `service/${cluster}/api`;
  console.log('Setting autoscaling min/max to 0...');
  run(
    `aws application-autoscaling register-scalable-target --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id ${resourceId} --min-capacity 0 --max-capacity 0 --region ${config.region}`,
  );

  // Set desired count to 0
  console.log('Setting ECS desired count to 0...');
  run(
    `aws ecs update-service --cluster ${cluster} --service api --desired-count 0 --region ${config.region} --no-cli-pager`,
  );

  // Stop RDS
  stopRds(config);

  console.log('\n✓ Environment stopped. Ongoing costs: RDS stopped storage, S3, CloudFront.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
