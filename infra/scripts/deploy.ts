/** staging:deploy — Deploy an explicit stack target or all stacks. */
import {
  getConfig,
  getGitShortSha,
  isRdsStopped,
  run,
  runCapture,
  stackPrefix,
  startRdsAndWait,
} from './helpers.js';

const VALID_TARGETS = ['all', 'cert', 'foundation', 'app'] as const;
type Target = (typeof VALID_TARGETS)[number];

function deployStack(stackName: string, extraArgs = ''): void {
  console.log(`\n--- cdk diff ${stackName} ---`);
  try {
    run(`pnpm exec cdk diff ${stackName} ${extraArgs}`.trim());
  } catch {
    // diff exits non-zero when there are differences; that is expected
  }
  console.log(`\n--- cdk deploy ${stackName} ---`);
  run(
    `pnpm exec cdk deploy ${stackName} --exclusively --require-approval broadening ${extraArgs}`.trim(),
  );
}

async function main(): Promise<void> {
  const config = getConfig();

  const prefix = stackPrefix(config);
  const target = process.argv[2] as Target | undefined;

  if (!target) {
    throw new Error(`Deploy target is required. Valid targets: ${VALID_TARGETS.join(', ')}.`);
  }

  if (!VALID_TARGETS.includes(target)) {
    throw new Error(
      `Unknown deploy target "${target}". Valid targets: ${VALID_TARGETS.join(', ')}.`,
    );
  }

  const targets: Target[] = target === 'all' ? ['cert', 'foundation', 'app'] : [target];

  for (const t of targets) {
    switch (t) {
      case 'cert': {
        console.log('\n=== Deploying Cert stack ===');
        deployStack(`${prefix}Cert`);
        break;
      }
      case 'foundation': {
        console.log('\n=== Deploying Foundation stack ===');
        if (isRdsStopped(config)) {
          startRdsAndWait(config);
        }
        deployStack(`${prefix}Foundation`);
        break;
      }
      case 'app': {
        console.log('\n=== Deploying App stack ===');
        if (isRdsStopped(config)) {
          startRdsAndWait(config);
        }

        const sha = getGitShortSha();
        const repoUri = runCapture(
          `aws ecr describe-repositories --repository-names steamx-${config.envName}-api --region ${config.region} --query "repositories[0].repositoryUri" --output text`,
        );

        // Check if image with this tag already exists
        let imageExists = false;
        try {
          runCapture(
            `aws ecr describe-images --repository-name steamx-${config.envName}-api --image-ids imageTag=${sha} --region ${config.region}`,
          );
          imageExists = true;
        } catch {
          imageExists = false;
        }

        if (imageExists) {
          console.log(`Image ${sha} already exists in ECR, skipping build.`);
        } else {
          console.log(`Building and pushing image ${sha}...`);
          run(
            `aws ecr get-login-password --region ${config.region} | docker login --username AWS --password-stdin ${config.account}.dkr.ecr.${config.region}.amazonaws.com`,
          );
          run(
            `docker buildx build --platform linux/arm64 -f apps/backend/Dockerfile --build-arg GIT_SHA=${sha} -t ${repoUri}:${sha} --push .`,
            { cwd: process.cwd().replace(/[\\/]infra$/, '') },
          );
        }

        deployStack(`${prefix}App`, `-c imageTag=${sha}`);
        break;
      }
    }
  }
  console.log('\n✓ Deploy complete.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
