import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { BaseStack } from '../lib/base-stack.js';
import { stagingConfig } from '../lib/environments/staging.js';

const budgetEmail = 'budget-recipient';
vi.setConfig({ testTimeout: 15000 });

function createBaseStack(protectData = false) {
  const config = { ...stagingConfig, protectData };
  const account = '123456789012';
  const app = new App({
    context: {
      'hosted-zone:account=123456789012:domainName=version26.in:region=ap-south-1': {
        Id: 'Z1234567890',
        Name: 'version26.in',
      },
    },
  });
  const stack = new BaseStack(app, 'SteamxStagingBase', config, budgetEmail, {
    stackName: 'SteamxStagingBase',
    env: { account, region: config.region },
  });
  return { stack, template: Template.fromStack(stack) };
}

describe('BaseStack', () => {
  it('creates exactly one named monthly budget with the configured notifications', () => {
    const { template } = createBaseStack();
    template.resourceCountIs('AWS::Budgets::Budget', 1);
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'steamx-staging-budget',
        BudgetLimit: { Amount: 25, Unit: 'USD' },
        TimeUnit: 'MONTHLY',
        BudgetType: 'COST',
      },
      NotificationsWithSubscribers: [
        {
          Notification: {
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: budgetEmail }],
        },
        {
          Notification: {
            NotificationType: 'FORECASTED',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 100,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: budgetEmail }],
        },
      ],
    });
  });

  it('creates the API repository with scan-on-push and a ten-image lifecycle limit', () => {
    const { template } = createBaseStack();
    const repositories = Object.values(template.findResources('AWS::ECR::Repository'));
    expect(repositories).toHaveLength(1);
    expect(repositories[0]?.Properties).toMatchObject({
      RepositoryName: 'steamx-staging-api',
      ImageScanningConfiguration: { ScanOnPush: true },
      ImageTagMutability: 'IMMUTABLE',
      EmptyOnDelete: true,
    });
    expect(repositories[0]?.Properties?.LifecyclePolicy).toMatchObject({
      LifecyclePolicyText: expect.stringContaining('"countNumber":10'),
    });
    expect(repositories[0]?.DeletionPolicy).toBe('Delete');
    expect(repositories[0]?.UpdateReplacePolicy).toBe('Delete');
    template.hasOutput('ApiRepositoryName', {});
    template.hasOutput('ApiRepositoryUri', {});
  });

  it('retains the API repository when environment data protection is enabled', () => {
    const { template } = createBaseStack(true);
    const repositories = Object.values(template.findResources('AWS::ECR::Repository'));
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { EmptyOnDelete: false },
    });
  });

  it('creates a DNS-validated origin certificate and unnamed generated secrets', () => {
    const { template } = createBaseStack();
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'origin.version26.in',
      DomainValidationOptions: [{ DomainName: 'origin.version26.in', HostedZoneId: 'Z1234567890' }],
      ValidationMethod: 'DNS',
    });
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    expect(secrets).toHaveLength(2);
    expect(secrets.map((secret) => secret.Properties?.Name)).toEqual([undefined, undefined]);
    expect(secrets.map((secret) => secret.Properties?.GenerateSecretString)).toEqual(
      expect.arrayContaining([
        { ExcludePunctuation: true, PasswordLength: 64 },
        { ExcludePunctuation: true, PasswordLength: 40 },
      ]),
    );
    template.hasOutput('OriginVerifySecretArn', {});
  });

  it('applies project and environment tags to the stack', () => {
    const { stack, template } = createBaseStack();
    expect(stack.tags.tagValues()).toMatchObject({
      project: 'steamx',
      environment: 'staging',
    });
    template.hasResourceProperties('AWS::Budgets::Budget', {
      ResourceTags: [
        { Key: 'project', Value: 'steamx' },
        { Key: 'environment', Value: 'staging' },
      ],
    });
  });

  it('creates two private, versioned buckets with the required lifecycle and CORS', () => {
    const { template } = createBaseStack();
    const buckets = Object.values(template.findResources('AWS::S3::Bucket'));
    expect(buckets).toHaveLength(2);

    for (const bucket of buckets) {
      expect(bucket.Properties).toMatchObject({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        VersioningConfiguration: { Status: 'Enabled' },
        LifecycleConfiguration: {
          Rules: [
            {
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
              ExpiredObjectDeleteMarker: true,
              NoncurrentVersionExpiration: { NoncurrentDays: 30 },
            },
          ],
        },
      });

      const cors = bucket.Properties?.CorsConfiguration as {
        CorsRules: Array<{
          AllowedHeaders: string[];
          AllowedMethods: string[];
          AllowedOrigins: string[];
          ExposedHeaders: string[];
          MaxAge: number;
        }>;
      };
      expect(cors.CorsRules).toHaveLength(1);
      const rule = cors.CorsRules[0];
      expect(rule).toBeDefined();
      expect(rule?.AllowedHeaders).toEqual([
        'Content-Type',
        'Content-Length',
        'If-None-Match',
        'Range',
      ]);
      expect(rule?.AllowedMethods).toEqual(['PUT', 'GET', 'HEAD']);
      expect(rule?.ExposedHeaders).toEqual(['ETag', 'Content-Disposition']);
      expect(rule?.MaxAge).toBe(3000);
      expect(JSON.stringify(bucket.Properties?.LifecycleConfiguration)).not.toContain(
        'ExpirationInDays',
      );
      const allowedOrigins = rule?.AllowedOrigins;
      expect(allowedOrigins).toBeDefined();
      expect(allowedOrigins).toEqual([
        stagingConfig.appOrigin,
        'http://localhost:3000',
        'http://localhost:5173',
      ]);
    }

    const secureBucketPolicies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
    expect(secureBucketPolicies).toHaveLength(2);
    for (const bucketPolicy of secureBucketPolicies) {
      const policyDocument = bucketPolicy.Properties?.PolicyDocument as {
        Statement: Array<{
          Condition?: { Bool?: { 'aws:SecureTransport'?: string } };
          Effect: string;
        }>;
      };
      expect(
        policyDocument.Statement.some(
          (statement) =>
            statement.Effect === 'Deny' &&
            statement.Condition?.Bool?.['aws:SecureTransport'] === 'false',
        ),
      ).toBe(true);
    }
  });

  it('limits the local development user to the two bucket prefixes and creates no access keys', () => {
    const { template } = createBaseStack();
    template.resourceCountIs('AWS::IAM::AccessKey', 0);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'steamx-staging-local-dev',
    });
    expect(Object.keys(template.findResources('AWS::IAM::User'))).toEqual([
      'DevStorageLocalDevUserDB71C012',
    ]);

    const buckets = template.findResources('AWS::S3::Bucket');
    const bucketIds = Object.keys(buckets);
    expect(bucketIds).toHaveLength(2);

    const policyResources = Object.values(template.findResources('AWS::IAM::Policy'));
    expect(policyResources).toHaveLength(1);
    const policyDocument = policyResources[0]?.Properties?.PolicyDocument as {
      Statement: Array<{ Resource: unknown }>;
    };
    const policyResourceJson = policyDocument.Statement.map((statement) =>
      JSON.stringify(statement.Resource),
    );
    expect(policyResourceJson).toHaveLength(4);
    for (const resource of policyResourceJson) {
      expect(bucketIds.some((logicalId) => resource.includes(logicalId))).toBe(true);
    }
    const policyJson = JSON.stringify(policyDocument);
    for (const logicalId of bucketIds) {
      expect(policyJson).toContain(logicalId);
    }
    expect(policyJson).toContain('assets/*');
    expect(policyJson).toContain('submissions/*');
  });
});
