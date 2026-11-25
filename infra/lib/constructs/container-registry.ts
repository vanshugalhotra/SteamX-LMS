import { RemovalPolicy, aws_ecr as ecr } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class ContainerRegistry extends ecr.Repository {
  constructor(scope: Construct, id: string, envName: string, retainOnDelete: boolean) {
    super(scope, id, {
      repositoryName: `steamx-${envName}-api`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: retainOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      emptyOnDelete: !retainOnDelete,
    });
  }
}
