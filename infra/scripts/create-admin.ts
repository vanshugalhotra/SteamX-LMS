/** staging:create-admin — Run the admin-create script as a one-off ECS Fargate task. */
import { getConfig, promptHidden, run, runCapture } from './helpers.js';

async function main(): Promise<void> {
  const config = getConfig();

  const steamxId = process.argv[2];
  const name = process.argv[3];
  if (!steamxId) {
    throw new Error('Usage: pnpm staging:create-admin <steamxId> [name]');
  }

  const password = await promptHidden('Admin password: ');
  if (!password) {
    throw new Error('Password is required.');
  }

  const cluster = `steamx-${config.envName}`;

  console.log(`\nRunning admin-create as a one-off ECS task in cluster ${cluster}...`);

  // Get the service's task definition and network config
  const serviceJson = runCapture(
    `aws ecs describe-services --cluster ${cluster} --services api --region ${config.region} --query "services[0]" --output json`,
  );
  const service = JSON.parse(serviceJson) as {
    taskDefinition: string;
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: string[];
        securityGroups: string[];
        assignPublicIp: string;
      };
    };
  };

  const network = service.networkConfiguration.awsvpcConfiguration;
  const networkConfiguration = `awsvpcConfiguration={subnets=[${network.subnets.join(',')}],securityGroups=[${network.securityGroups.join(',')}],assignPublicIp=${network.assignPublicIp}}`;

  const envOverrides: Array<{ name: string; value: string }> = [
    { name: 'ADMIN_STEAMX_ID', value: steamxId },
    { name: 'ADMIN_PASSWORD', value: password },
  ];
  if (name) {
    envOverrides.push({ name: 'ADMIN_NAME', value: name });
  }

  const overrides = JSON.stringify({
    containerOverrides: [
      {
        name: 'api',
        command: ['node', 'dist/scripts/admin-create.js'],
        environment: envOverrides,
      },
    ],
  });

  const taskResult = runCapture(
    `aws ecs run-task --cluster ${cluster} --task-definition ${service.taskDefinition} --launch-type FARGATE --network-configuration "${networkConfiguration}" --overrides ${JSON.stringify(overrides)} --region ${config.region} --output json`,
  );

  const parsed = JSON.parse(taskResult) as {
    failures?: unknown[];
    tasks?: Array<{ taskArn: string }>;
  };
  if (parsed.failures?.length || !parsed.tasks?.length) {
    throw new Error(`Failed to start task: ${JSON.stringify(parsed.failures)}`);
  }

  const taskArn = parsed.tasks[0]!.taskArn;
  console.log(`Task started: ${taskArn}`);
  console.log('Waiting for task to complete...');

  run(
    `aws ecs wait tasks-stopped --cluster ${cluster} --tasks ${taskArn} --region ${config.region}`,
  );

  const exitCode = runCapture(
    `aws ecs describe-tasks --cluster ${cluster} --tasks ${taskArn} --region ${config.region} --query "tasks[0].containers[?name=='api']|[0].exitCode" --output text`,
  );

  if (exitCode !== '0') {
    throw new Error(
      `Admin-create task failed with exit code ${exitCode}. Check CloudWatch logs for details.`,
    );
  }

  console.log('✓ Admin account created successfully.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
