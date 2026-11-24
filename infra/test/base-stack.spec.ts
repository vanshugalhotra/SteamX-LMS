import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { BaseStack } from '../lib/base-stack.js';
import { loadEnvironmentConfig } from '../lib/environments/index.js';
import { stagingConfig } from '../lib/environments/staging.js';

const budgetEmail = 'budget-recipient';
vi.setConfig({ testTimeout: 15000 });

function createBaseStack() {
  const loaded = loadEnvironmentConfig({ env: 'staging' }, { STEAMX_BUDGET_EMAIL: budgetEmail });
  const app = new App();
  const stack = new BaseStack(app, 'SteamxStagingBase', loaded.config, loaded.budgetEmail, {
    stackName: 'SteamxStagingBase',
    env: { region: loaded.config.region },
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

  it('rejects environments that are not defined', () => {
    expect(() =>
      loadEnvironmentConfig({ env: 'production' }, { STEAMX_BUDGET_EMAIL: budgetEmail }),
    ).toThrow('only staging is defined');
  });

  it('requires the budget notification email', () => {
    expect(() => loadEnvironmentConfig({ env: 'staging' }, {})).toThrow(
      'STEAMX_BUDGET_EMAIL is required',
    );
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
        'https://version26.in',
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

  it('rejects app origins without https or with a trailing slash', () => {
    const originalOrigin = stagingConfig.appOrigin;
    try {
      stagingConfig.appOrigin = 'http://version26.in';
      expect(() =>
        loadEnvironmentConfig({ env: 'staging' }, { STEAMX_BUDGET_EMAIL: budgetEmail }),
      ).toThrow('appOrigin');

      stagingConfig.appOrigin = 'https://version26.in/';
      expect(() =>
        loadEnvironmentConfig({ env: 'staging' }, { STEAMX_BUDGET_EMAIL: budgetEmail }),
      ).toThrow('appOrigin');
    } finally {
      stagingConfig.appOrigin = originalOrigin;
    }
  });
});
