import { App, RemovalPolicy, Stack, Tags } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { getInfrastructureConfig } from '../lib/config.js';
import { SteamxStack } from '../lib/steamx-stack.js';

const budgetEmail = 'infra-test@example.com';
vi.setConfig({ testTimeout: 15000 });

type ObjectArnJoin = {
  'Fn::Join': [string, Array<{ 'Fn::GetAtt': [string, string] } | string>];
};

function createStagingTemplate(): Template {
  const app = new App();
  const config = getInfrastructureConfig(
    'staging',
    { STEAMX_BUDGET_EMAIL: budgetEmail },
    'ap-south-1',
  );
  const stack = new SteamxStack(app, 'SteamxStagingStack', config, {
    env: { account: '123456789012', region: config.region },
  });
  return Template.fromStack(stack);
}

describe('SteamxStack', () => {
  it('blocks public access and requires SSL for the bucket', () => {
    const template = createStagingTemplate();

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 's3:*',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('configures the expected CORS methods and ETag header', () => {
    createStagingTemplate().hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedOrigins: ['http://localhost:3000', 'http://localhost:5173'],
            AllowedHeaders: ['*'],
            ExposedHeaders: ['ETag'],
            MaxAge: 3000,
          }),
        ]),
      },
    });
  });

  it('limits the backend user to its two object prefixes and scoped listing', () => {
    const template = createStagingTemplate();
    const policies = template.findResources('AWS::IAM::Policy');
    expect(Object.keys(policies)).toHaveLength(1);

    const policy = Object.values(policies)[0] as {
      Properties: { PolicyDocument: { Statement: Array<Record<string, unknown>> } };
    };
    const statements = policy.Properties.PolicyDocument.Statement;
    expect(statements).toHaveLength(2);

    const objectStatement = statements[0];
    const listStatement = statements[1];
    if (!objectStatement || !listStatement) {
      throw new Error('Expected separate object and ListBucket policy statements.');
    }

    expect(objectStatement).toMatchObject({
      Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      Effect: 'Allow',
    });
    const objectResources = objectStatement.Resource as ObjectArnJoin[];
    expect(objectResources.map((resource) => resource['Fn::Join'][1].at(-1))).toEqual([
      '/assets/*',
      '/submissions/*',
    ]);

    const bucketLogicalId = Object.keys(template.findResources('AWS::S3::Bucket'))[0];
    if (!bucketLogicalId) {
      throw new Error('Expected one S3 bucket in the staging stack.');
    }
    expect(objectResources).toHaveLength(2);
    for (const resource of objectResources) {
      expect(resource['Fn::Join'][1][0]).toEqual({
        'Fn::GetAtt': [bucketLogicalId, 'Arn'],
      });
    }

    expect(listStatement).toEqual({
      Action: 's3:ListBucket',
      Condition: {
        StringLike: {
          's3:prefix': ['assets/*', 'submissions/*'],
        },
      },
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [bucketLogicalId, 'Arn'] },
    });
  });

  it('does not create an access key resource', () => {
    createStagingTemplate().resourceCountIs('AWS::IAM::AccessKey', 0);
  });

  it('creates the monthly budget with actual and forecast notifications', () => {
    createStagingTemplate().hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetLimit: { Amount: 25, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: {
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
            ThresholdType: 'PERCENTAGE',
          },
        }),
        Match.objectLike({
          Notification: {
            NotificationType: 'FORECASTED',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 100,
            ThresholdType: 'PERCENTAGE',
          },
        }),
      ]),
      ResourceTags: [
        { Key: 'project', Value: 'steamx' },
        { Key: 'env', Value: 'staging' },
      ],
    });
  });

  it('retains resources and enables termination protection outside staging', () => {
    const config = getInfrastructureConfig(
      'production',
      { STEAMX_BUDGET_EMAIL: budgetEmail },
      'ap-south-1',
    );
    expect(config.bucketRemovalPolicy).toBe(RemovalPolicy.RETAIN);
    expect(config.autoDeleteObjects).toBe(false);
    expect(config.terminationProtection).toBe(true);

    const app = new App();
    const stack = new SteamxStack(app, 'SteamxProductionStack', config);
    Tags.of(stack).add('project', 'steamx');
    Template.fromStack(stack).hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });
});
