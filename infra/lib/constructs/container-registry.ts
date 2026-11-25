import { RemovalPolicy, aws_ecr as ecr } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class ContainerRegistry extends ecr.Repository {
  constructor(scope: Construct, id: string, envName: string) {
    super(scope, id, {
      repositoryName: `steamx-${envName}-api`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
  }
}
