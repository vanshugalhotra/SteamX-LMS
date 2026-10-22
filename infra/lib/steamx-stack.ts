import {
  CfnOutput,
  Duration,
  Stack,
  Tags,
  aws_budgets as budgets,
  aws_iam as iam,
  aws_s3 as s3,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { InfrastructureConfig } from './config.js';

export class SteamxStack extends Stack {
  constructor(scope: Construct, id: string, config: InfrastructureConfig, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('env', config.environmentName);

    const bucket = new s3.Bucket(this, 'AssetsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // TODO(prod): enable versioning and add a lifecycle rule to expire non-current versions.
      versioned: false,
      removalPolicy: config.bucketRemovalPolicy,
      autoDeleteObjects: config.autoDeleteObjects,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: config.corsOrigins,
          allowedHeaders: ['Content-Type', 'Content-Length', 'If-None-Match', 'Range'],
          exposedHeaders: ['ETag', 'Content-Disposition'],
          maxAge: 3000,
        },
      ],
    });

    const backendUser = new iam.User(this, 'BackendUser', {
      userName: `steamx-${config.environmentName}-backend`,
    });
    backendUser.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [bucket.arnForObjects('assets/*'), bucket.arnForObjects('submissions/*')],
      }),
    );
    backendUser.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [bucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': ['assets/*', 'submissions/*'],
          },
        },
      }),
    );

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `steamx-${config.environmentName}-monthly`,
        budgetLimit: {
          amount: config.budgetAmount,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: config.budgetEmail }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: config.budgetEmail }],
        },
      ],
      resourceTags: [
        { key: 'project', value: 'steamx' },
        { key: 'env', value: config.environmentName },
      ],
    });

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'Region', { value: config.region });
    new CfnOutput(this, 'BackendUserName', { value: backendUser.userName });

    // Add RDS, ECS, and ALB resources here when the staging domain is available.
    // Add CloudFront here when the frontend distribution is ready.
  }
}
