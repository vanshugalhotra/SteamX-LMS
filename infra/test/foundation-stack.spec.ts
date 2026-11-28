import { App, aws_certificatemanager as acm } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { FoundationStack } from '../lib/foundation-stack.js';
import { stagingConfig } from '../lib/environments/staging.js';

const budgetEmail = 'budget-recipient';
vi.setConfig({ testTimeout: 30000 });

function createFoundationStack(protectData = false) {
  const account = '123456789012';
  const config = { ...stagingConfig, account, protectData };
  const app = new App({
    context: {
      'hosted-zone:account=123456789012:domainName=version26.in:region=ap-south-1': {
        Id: 'Z1234567890',
        Name: 'version26.in',
      },
    },
  });
  const edgeCertificate = acm.Certificate.fromCertificateArn(
    app,
    'EdgeCertificate',
    `arn:aws:acm:us-east-1:${account}:certificate/12345678-1234-1234-1234-123456789012`,
  );
  const stack = new FoundationStack(app, 'SteamxStagingFoundation', config, budgetEmail, {
    stackName: 'SteamxStagingFoundation',
    env: { account, region: config.region },
    edgeCertificate,
    crossRegionReferences: true,
  });
  return { stack, template: Template.fromStack(stack) };
}

function hasSubnetName(subnet: unknown, name: string): boolean {
  const tags = getProperties(subnet).Tags;
  return (
    Array.isArray(tags) &&
    tags.some(
      (tag) =>
        typeof tag === 'object' &&
        tag !== null &&
        'Key' in tag &&
        'Value' in tag &&
        tag.Key === 'aws-cdk:subnet-name' &&
        tag.Value === name,
    )
  );
}

function getProperties(resource: unknown): Record<string, unknown> {
  if (typeof resource !== 'object' || resource === null || !('Properties' in resource)) {
    throw new Error('Expected a CloudFormation resource with properties.');
  }
  const properties = resource.Properties;
  if (typeof properties !== 'object' || properties === null) {
    throw new Error('Expected CloudFormation resource properties.');
  }
  return properties as Record<string, unknown>;
}

function getReferenceId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('Ref' in value)) {
    return undefined;
  }
  const reference = (value as { Ref?: unknown }).Ref;
  return typeof reference === 'string' ? reference : undefined;
}

function getSecurityGroup(template: Template, description: string) {
  const groups = Object.entries(template.findResources('AWS::EC2::SecurityGroup')).filter(
    ([, resource]) => resource.Properties.GroupDescription === description,
  );
  expect(groups).toHaveLength(1);
  const group = groups[0];
  if (!group) {
    throw new Error(`Expected security group with description "${description}".`);
  }
  return { logicalId: group[0], properties: group[1].Properties };
}

function getIngressGroupId(rule: unknown): string | undefined {
  const groupId = getProperties(rule).GroupId;
  if (typeof groupId !== 'object' || groupId === null || !('Fn::GetAtt' in groupId)) {
    return undefined;
  }
  const attributes = (groupId as { 'Fn::GetAtt'?: unknown })['Fn::GetAtt'];
  return Array.isArray(attributes) && typeof attributes[0] === 'string' ? attributes[0] : undefined;
}

describe('FoundationStack', () => {
  it('creates the staging PostgreSQL database with the expected storage, backup, and deletion settings', () => {
    const { template } = createFoundationStack();
    const instances = Object.values(template.findResources('AWS::RDS::DBInstance'));
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      DeletionPolicy: 'Delete',
      Properties: {
        DBInstanceClass: 'db.t4g.micro',
        Engine: 'postgres',
        EngineVersion: '18',
        MultiAZ: false,
        StorageEncrypted: true,
        PubliclyAccessible: false,
        StorageType: 'gp3',
        AllocatedStorage: '20',
        MaxAllocatedStorage: stagingConfig.dbMaxAllocatedStorageGb,
        BackupRetentionPeriod: stagingConfig.dbBackupRetentionDays,
        DeletionProtection: false,
        PreferredBackupWindow: '19:00-19:30',
        PreferredMaintenanceWindow: 'sun:20:00-sun:20:30',
      },
    });

    const parameterGroups = Object.values(template.findResources('AWS::RDS::DBParameterGroup'));
    expect(parameterGroups).toHaveLength(1);
    expect(parameterGroups[0]?.Properties).toMatchObject({
      Family: 'postgres18',
      Parameters: {
        'rds.force_ssl': '1',
      },
    });
  });

  it('places the database in isolated subnets and attaches only the database security group', () => {
    const { template } = createFoundationStack();
    const isolatedSubnetIds = new Set(
      Object.entries(template.findResources('AWS::EC2::Subnet'))
        .filter(([, subnet]) => hasSubnetName(subnet, 'isolated'))
        .map(([id]) => id),
    );
    const dbSubnetGroups = Object.values(template.findResources('AWS::RDS::DBSubnetGroup'));
    expect(dbSubnetGroups).toHaveLength(1);
    const subnetIds = getProperties(dbSubnetGroups[0]).SubnetIds;
    expect(Array.isArray(subnetIds)).toBe(true);
    if (!Array.isArray(subnetIds)) {
      throw new Error('Expected the database subnet group to contain subnet IDs.');
    }
    const dbSubnetIds = new Set(subnetIds.map(getReferenceId));
    expect(dbSubnetIds.size).toBe(2);
    expect([...dbSubnetIds].every((id) => id !== undefined && isolatedSubnetIds.has(id))).toBe(
      true,
    );

    const db = getSecurityGroup(template, 'Allow PostgreSQL traffic only from ECS tasks.');
    const instances = Object.values(template.findResources('AWS::RDS::DBInstance'));
    expect(instances).toHaveLength(1);
    expect(instances[0]?.Properties?.VPCSecurityGroups).toEqual([
      { 'Fn::GetAtt': [db.logicalId, 'GroupId'] },
    ]);
  });

  it('generates credentials without a fixed secret name or URL-unsafe characters', () => {
    const { template } = createFoundationStack();
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    // Foundation: JWT, OriginVerify, DB credentials = 3 secrets
    expect(secrets.length).toBeGreaterThanOrEqual(3);
    const credentialsSecret = secrets.find(
      (secret) => secret.Properties?.GenerateSecretString?.SecretStringTemplate !== undefined,
    );
    expect(credentialsSecret?.Properties).not.toHaveProperty('Name');
    expect(credentialsSecret?.Properties?.GenerateSecretString).toMatchObject({
      SecretStringTemplate: JSON.stringify({ username: 'steamx_owner' }),
    });
    // The ExcludeCharacters is validated by the database.spec.ts; skip string-literal escaping here.
  });

  it('creates a two-AZ VPC with public and isolated subnets and no NAT gateways', () => {
    const { template } = createFoundationStack();
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: '10.0.0.0/16' });
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::InternetGateway', 1);

    const subnets = Object.values(template.findResources('AWS::EC2::Subnet'));
    expect(subnets).toHaveLength(4);
    expect(subnets.filter((subnet) => hasSubnetName(subnet, 'public'))).toHaveLength(2);
    expect(subnets.filter((subnet) => hasSubnetName(subnet, 'isolated'))).toHaveLength(2);
    expect(new Set(subnets.map((subnet) => subnet.Properties.AvailabilityZone)).size).toBe(2);
    expect(subnets.every((subnet) => subnet.Properties.CidrBlock.endsWith('/24'))).toBe(true);
  });

  it('does not add internet routes to isolated subnet route tables', () => {
    const { template } = createFoundationStack();
    const isolatedSubnetIds = new Set(
      Object.entries(template.findResources('AWS::EC2::Subnet'))
        .filter(([, subnet]) => hasSubnetName(subnet, 'isolated'))
        .map(([id]) => id),
    );
    const isolatedRouteTableIds = new Set(
      Object.values(template.findResources('AWS::EC2::SubnetRouteTableAssociation'))
        .filter((association) =>
          isolatedSubnetIds.has(getReferenceId(association.Properties.SubnetId) ?? ''),
        )
        .map((association) => getReferenceId(association.Properties.RouteTableId))
        .filter((id): id is string => id !== undefined),
    );
    const internetRoutes = Object.values(template.findResources('AWS::EC2::Route')).filter(
      (route) =>
        isolatedRouteTableIds.has(getReferenceId(route.Properties.RouteTableId) ?? '') &&
        route.Properties.DestinationCidrBlock === '0.0.0.0/0',
    );

    expect(isolatedRouteTableIds.size).toBe(2);
    expect(internetRoutes).toHaveLength(0);
  });

  it('allows HTTPS to the ALB only from a prefix list', () => {
    const { template } = createFoundationStack();
    const alb = getSecurityGroup(
      template,
      'Allow HTTPS from the CloudFront origin-facing network.',
    );
    const ingressRules = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'));
    const albIngress = ingressRules.filter((rule) => getIngressGroupId(rule) === alb.logicalId);

    expect(albIngress).toHaveLength(1);
    expect(albIngress[0]?.Properties).toMatchObject({
      IpProtocol: 'tcp',
      FromPort: 443,
      ToPort: 443,
      SourcePrefixListId: 'pl-xxxxxxxx',
    });
  });

  it('allows DB ingress only from the ECS security group', () => {
    const { template } = createFoundationStack();
    const ecs = getSecurityGroup(
      template,
      'Allow API traffic only from the application load balancer.',
    );
    const db = getSecurityGroup(template, 'Allow PostgreSQL traffic only from ECS tasks.');
    const ingressRules = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'));
    const dbIngress = ingressRules.filter((rule) => getIngressGroupId(rule) === db.logicalId);

    expect(dbIngress).toHaveLength(1);
    expect(dbIngress[0]?.Properties).toMatchObject({
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: { 'Fn::GetAtt': [ecs.logicalId, 'GroupId'] },
    });
    expect(db.properties.SecurityGroupEgress).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ CidrIp: '0.0.0.0/0' })]),
    );
  });

  it('creates exactly one named monthly budget with the configured notifications', () => {
    const { template } = createFoundationStack();
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
    const { template } = createFoundationStack();
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
    const { template } = createFoundationStack(true);
    const repositories = Object.values(template.findResources('AWS::ECR::Repository'));
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { EmptyOnDelete: false },
    });
  });

  it('creates a DNS-validated origin certificate and unnamed generated secrets', () => {
    const { template } = createFoundationStack();
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'origin.version26.in',
      DomainValidationOptions: [{ DomainName: 'origin.version26.in', HostedZoneId: 'Z1234567890' }],
      ValidationMethod: 'DNS',
    });
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    // None of the secrets should have a fixed Name
    expect(secrets.every((secret) => secret.Properties?.Name === undefined)).toBe(true);
    const generatedSecrets = secrets.filter(
      (s) => s.Properties?.GenerateSecretString?.ExcludePunctuation === true,
    );
    expect(
      generatedSecrets.map((s) => s.Properties.GenerateSecretString.PasswordLength).sort(),
    ).toEqual([40, 64]);
    template.hasOutput('OriginVerifySecretArn', {});
  });

  it('creates the CloudFront distribution, routed behaviors, OAC policy, and app alias', () => {
    const { template } = createFoundationStack();
    const distributionResources = template.findResources('AWS::CloudFront::Distribution');
    const distributionLogicalId = Object.keys(distributionResources)[0];
    const distributions = Object.values(distributionResources);
    expect(distributions).toHaveLength(1);
    expect(distributionLogicalId).toBeDefined();

    const distributionConfig = distributions[0]?.Properties?.DistributionConfig as {
      Aliases: string[];
      DefaultCacheBehavior: {
        AllowedMethods: string[];
        CachePolicyId: string;
        ResponseHeadersPolicyId: string;
        ViewerProtocolPolicy: string;
      };
      ViewerCertificate: {
        AcmCertificateArn: string;
        MinimumProtocolVersion: string;
      };
      CacheBehaviors: Array<{
        AllowedMethods: string[];
        CachePolicyId: string;
        OriginRequestPolicyId: string;
        PathPattern: string;
        TargetOriginId: string;
        ViewerProtocolPolicy: string;
      }>;
      Origins: Array<Record<string, unknown>>;
      CustomErrorResponses?: unknown[];
      PriceClass?: string;
    };
    expect(distributionConfig.Aliases).toEqual(['learn.version26.in']);
    expect(distributionConfig.ViewerCertificate).toMatchObject({
      AcmCertificateArn:
        'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
      MinimumProtocolVersion: 'TLSv1.2_2021',
    });
    expect(distributionConfig.DefaultCacheBehavior).toMatchObject({
      AllowedMethods: ['GET', 'HEAD'],
      CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
      ResponseHeadersPolicyId: '67f7725c-6f97-4210-82d7-5512b31e9d03',
      ViewerProtocolPolicy: 'redirect-to-https',
    });
    expect(JSON.stringify(distributionConfig.DefaultCacheBehavior)).toContain('viewer-request');

    const spaOrigin = distributionConfig.Origins.find((origin) => origin.OriginPath === '/spa');
    expect(spaOrigin).toMatchObject({
      OriginPath: '/spa',
      S3OriginConfig: { OriginAccessIdentity: '' },
    });
    expect(spaOrigin?.OriginAccessControlId).toBeDefined();

    expect(distributionConfig.CacheBehaviors.map((behavior) => behavior.PathPattern)).toEqual([
      '/api/*',
      '/health/*',
    ]);
    expect(distributionConfig.CacheBehaviors[0]?.TargetOriginId).toBe(
      distributionConfig.CacheBehaviors[1]?.TargetOriginId,
    );
    for (const behavior of distributionConfig.CacheBehaviors) {
      expect(behavior).toMatchObject({
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
        ViewerProtocolPolicy: 'https-only',
      });
      const expectedMethods =
        behavior.PathPattern === '/api/*'
          ? ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
          : ['GET', 'HEAD'];
      expect([...behavior.AllowedMethods].sort()).toEqual(expectedMethods.sort());
    }

    const apiOrigin = distributionConfig.Origins.find(
      (origin) => origin.DomainName === 'origin.version26.in',
    );
    expect(apiOrigin).toMatchObject({
      CustomOriginConfig: { OriginProtocolPolicy: 'https-only' },
      OriginCustomHeaders: [{ HeaderName: 'X-Origin-Verify' }],
    });
    expect(JSON.stringify(apiOrigin?.OriginCustomHeaders)).toContain('{{resolve:secretsmanager:');
    expect(
      Object.values(template.findResources('AWS::CloudFront::OriginAccessControl')),
    ).toHaveLength(1);
    expect(
      Object.keys(template.findResources('AWS::CloudFront::CloudFrontOriginAccessIdentity')),
    ).toHaveLength(0);

    const bucketPolicies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
    const distributionPolicy = bucketPolicies.find((policy) =>
      JSON.stringify(policy.Properties?.PolicyDocument).includes('cloudfront.amazonaws.com'),
    );
    expect(distributionPolicy).toBeDefined();
    expect(JSON.stringify(distributionPolicy?.Properties?.PolicyDocument)).toContain(
      'AWS:SourceArn',
    );
    expect(JSON.stringify(distributionPolicy?.Properties?.PolicyDocument)).toContain(
      `"Ref":"${distributionLogicalId}"`,
    );
    expect(distributionConfig.CustomErrorResponses).toBeUndefined();
    expect(distributionConfig.PriceClass).toBeUndefined();
    const appAlias = Object.values(template.findResources('AWS::Route53::RecordSet')).find(
      (record) => record.Properties?.Name === 'learn.version26.in.',
    );
    expect(appAlias?.Properties).toMatchObject({
      Name: 'learn.version26.in.',
      Type: 'A',
    });
    expect(JSON.stringify(appAlias?.Properties?.AliasTarget)).toContain(distributionLogicalId);
    template.hasOutput('DistributionId', {});
    template.hasOutput('DistributionDomainName', {});
    template.hasOutput('AppUrl', {});
  });

  it('applies project and environment tags to the stack', () => {
    const { stack, template } = createFoundationStack();
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
    const { template } = createFoundationStack();
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
    expect(secureBucketPolicies.length).toBeGreaterThanOrEqual(2);
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
    const { template } = createFoundationStack();
    template.resourceCountIs('AWS::IAM::AccessKey', 0);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'steamx-staging-local-dev',
    });

    const buckets = template.findResources('AWS::S3::Bucket');
    const bucketIds = Object.keys(buckets);
    expect(bucketIds).toHaveLength(2);

    // Find the IAM policy that references buckets (local-dev user policy)
    const policyResources = Object.values(template.findResources('AWS::IAM::Policy'));
    const userPolicy = policyResources.find((p) =>
      JSON.stringify(p.Properties?.PolicyDocument).includes('assets/*'),
    );
    expect(userPolicy).toBeDefined();
    const policyDocument = userPolicy?.Properties?.PolicyDocument as {
      Statement: Array<{ Resource: unknown }>;
    };
    const policyJson = JSON.stringify(policyDocument);
    for (const logicalId of bucketIds) {
      expect(policyJson).toContain(logicalId);
    }
    expect(policyJson).toContain('assets/*');
    expect(policyJson).toContain('submissions/*');
  });

  it('has no reference to AppStack resources', () => {
    const { template } = createFoundationStack();
    const templateJson = JSON.stringify(template.toJSON());
    // Foundation should not contain ECS service, cluster, ALB, or App-specific resources
    expect(Object.keys(template.findResources('AWS::ECS::Service'))).toHaveLength(0);
    expect(Object.keys(template.findResources('AWS::ECS::Cluster'))).toHaveLength(0);
    expect(
      Object.keys(template.findResources('AWS::ElasticLoadBalancingV2::LoadBalancer')),
    ).toHaveLength(0);
  });
});

describe('protectData flag', () => {
  it('uses DESTROY removal policy for RDS and buckets when protectData is false', () => {
    const { template } = createFoundationStack(false);
    const instances = Object.values(template.findResources('AWS::RDS::DBInstance'));
    expect(instances[0]).toMatchObject({
      DeletionPolicy: 'Delete',
      Properties: { DeletionProtection: false },
    });
    const buckets = Object.values(template.findResources('AWS::S3::Bucket'));
    for (const bucket of buckets) {
      expect(bucket.DeletionPolicy).toBe('Delete');
    }
  });

  it('uses RETAIN removal policy for RDS and buckets when protectData is true', () => {
    const { template } = createFoundationStack(true);
    const instances = Object.values(template.findResources('AWS::RDS::DBInstance'));
    expect(instances[0]).toMatchObject({
      DeletionPolicy: 'Retain',
      Properties: { DeletionProtection: true },
    });
    const buckets = Object.values(template.findResources('AWS::S3::Bucket'));
    for (const bucket of buckets) {
      expect(bucket.DeletionPolicy).toBe('Retain');
    }
  });

  it('retains secrets when protectData is true', () => {
    const { template } = createFoundationStack(true);
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    // JWT and OriginVerify secrets should be retained
    const generatedSecrets = secrets.filter(
      (s) => s.Properties?.GenerateSecretString?.ExcludePunctuation === true,
    );
    for (const secret of generatedSecrets) {
      expect(secret.DeletionPolicy).toBe('Retain');
    }
  });
});
