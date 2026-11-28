/** staging:start — Start RDS and restore ECS service. */
import { getConfig, isRdsStopped, run, startRdsAndWait } from './helpers.js';

async function main(): Promise<void> {
  const config = getConfig();

  console.log('This will:');
  console.log('  1. Start RDS and wait for it to become available');
  console.log(
    `  2. Restore ECS autoscaling to ${config.apiScaling.minTasks}–${config.apiScaling.maxTasks}`,
  );
  console.log(
    `  3. Set desired count to ${config.apiScaling.minTasks} and wait for service stable`,
  );
  console.log(`  Region: ${config.region}, Cluster: steamx-${config.envName}\n`);

  // Start RDS
  if (isRdsStopped(config)) {
    startRdsAndWait(config);
  } else {
    console.log('RDS is already running.');
  }

  const cluster = `steamx-${config.envName}`;
  const resourceId = `service/${cluster}/api`;

  // Restore autoscaling
  console.log(
    `Restoring autoscaling: min=${config.apiScaling.minTasks}, max=${config.apiScaling.maxTasks}...`,
  );
  run(
    `aws application-autoscaling register-scalable-target --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id ${resourceId} --min-capacity ${config.apiScaling.minTasks} --max-capacity ${config.apiScaling.maxTasks} --region ${config.region}`,
  );

  // Set desired count
  console.log(`Setting desired count to ${config.apiScaling.minTasks}...`);
  run(
    `aws ecs update-service --cluster ${cluster} --service api --desired-count ${config.apiScaling.minTasks} --region ${config.region} --no-cli-pager`,
  );

  // Wait for service stable
  console.log('Waiting for service to stabilize...');
  run(`aws ecs wait services-stable --cluster ${cluster} --services api --region ${config.region}`);

  console.log('\n✓ Environment started. ECS and RDS are running.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
