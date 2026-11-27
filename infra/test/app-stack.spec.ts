import { App, aws_certificatemanager as acm } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { AppStack } from '../lib/app-stack.js';
import { BaseStack } from '../lib/base-stack.js';
import { API_PORT } from '../lib/constructs/network.js';
import { stagingConfig } from '../lib/environments/staging.js';

vi.setConfig({ testTimeout: 30000 });

function createAppTemplate(imageTag?: string, migrationsOnly = false): Template {
  const account = '123456789012';
  const app = new App({
    context: {
      'hosted-zone:account=123456789012:domainName=version26.in:region=ap-south-1': {
        Id: 'Z1234567890',
        Name: 'version26.in',
      },
      ...(imageTag === undefined ? {} : { imageTag }),
      ...(migrationsOnly ? { migrationsOnly: 'true' } : {}),
    },
  });
  const env = { account, region: stagingConfig.region };
  const edgeCertificate = acm.Certificate.fromCertificateArn(
    app,
    'EdgeCertificate',
    `arn:aws:acm:us-east-1:${account}:certificate/12345678-1234-1234-1234-123456789012`,
  );
  const baseStack = new BaseStack(app, 'SteamxStagingBase', stagingConfig, 'budget-recipient', {
    stackName: 'SteamxStagingBase',
    env,
    edgeCertificate,
    crossRegionReferences: true,
  });
  const stack = new AppStack(app, 'SteamxStagingApp', stagingConfig, {
    stackName: 'SteamxStagingApp',
    env,
    repository: baseStack.repository,
    mediaBucket: baseStack.mediaBucket,
    uploadsBucket: baseStack.uploadsBucket,
    hostedZone: baseStack.hostedZone,
    originCertificate: baseStack.originCertificate,
    jwtSecret: baseStack.jwtSecret,
    originVerifySecret: baseStack.originVerifySecret,
  });
  return Template.fromStack(stack);
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

describe('AppStack', () => {
  it('creates the staging PostgreSQL database with the expected storage, backup, and deletion settings', () => {
    const template = createAppTemplate();
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
    const template = createAppTemplate();
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
    const template = createAppTemplate();
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    expect(secrets).toHaveLength(2);
    const credentialsSecret = secrets.find(
      (secret) => secret.Properties?.GenerateSecretString !== undefined,
    );
    const databaseUrlSecret = secrets.find(
      (secret) => secret.Properties?.SecretString !== undefined,
    );
    expect(credentialsSecret?.Properties).not.toHaveProperty('Name');
    expect(credentialsSecret?.Properties).toMatchObject({
      GenerateSecretString: {
        ExcludeCharacters: ' %+~#$&*()|[]{}:;<>?!\'/@"\\=`',
        SecretStringTemplate: JSON.stringify({ username: 'steamx_owner' }),
      },
    });
    expect(databaseUrlSecret?.Properties).not.toHaveProperty('Name');
    const databaseUrlTemplate = JSON.stringify(databaseUrlSecret?.Properties?.SecretString);
    expect(databaseUrlTemplate).toContain('resolve:secretsmanager');
    expect(databaseUrlTemplate).toContain('sslmode=require');
  });

  it('creates an ARM64 Fargate API task with Secrets Manager values', () => {
    const template = createAppTemplate();
    const taskDefinitions = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    expect(taskDefinitions).toHaveLength(1);
    const taskDefinition = taskDefinitions[0];
    expect(taskDefinition?.Properties).toMatchObject({
      Cpu: '512',
      Memory: '1024',
      RuntimePlatform: {
        CpuArchitecture: 'ARM64',
        OperatingSystemFamily: 'LINUX',
      },
    });

    const container = taskDefinition?.Properties?.ContainerDefinitions[0];
    expect(container).toMatchObject({
      Name: 'api',
      StopTimeout: 30,
      PortMappings: [{ ContainerPort: API_PORT }],
      Environment: expect.arrayContaining([
        { Name: 'NODE_ENV', Value: 'production' },
        { Name: 'PORT', Value: String(API_PORT) },
        { Name: 'AWS_REGION', Value: stagingConfig.region },
        { Name: 'S3_MEDIA_BUCKET', Value: expect.anything() },
        { Name: 'S3_UPLOADS_BUCKET', Value: expect.anything() },
        { Name: 'CORS_ORIGINS', Value: stagingConfig.appOrigin },
      ]),
      Secrets: expect.arrayContaining([
        { Name: 'DATABASE_URL', ValueFrom: expect.anything() },
        { Name: 'AUTH_JWT_SECRET', ValueFrom: expect.anything() },
      ]),
    });
    const environmentJson = JSON.stringify(container?.Environment);
    expect(environmentJson).not.toContain('DATABASE_URL');
    expect(environmentJson).not.toContain('AUTH_JWT_SECRET');
    expect(JSON.stringify(container?.Image)).toContain(':missing-image-tag');
  });

  it('configures the API service at its minimum capacity with CPU autoscaling', () => {
    const template = createAppTemplate();
    const services = Object.values(template.findResources('AWS::ECS::Service'));
    expect(services).toHaveLength(1);
    const service = services[0];
    expect(service?.Properties).toMatchObject({
      ServiceName: 'api',
      EnableExecuteCommand: true,
      DeploymentConfiguration: {
        MinimumHealthyPercent: 100,
        MaximumPercent: 200,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      },
      NetworkConfiguration: {
        AwsvpcConfiguration: { AssignPublicIp: 'ENABLED' },
      },
      DesiredCount: stagingConfig.apiScaling.minTasks,
    });

    const targets = Object.values(
      template.findResources('AWS::ApplicationAutoScaling::ScalableTarget'),
    ).filter((target) => target.Properties.ServiceNamespace === 'ecs');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.Properties).toMatchObject({
      MinCapacity: stagingConfig.apiScaling.minTasks,
      MaxCapacity: stagingConfig.apiScaling.maxTasks,
      ScalableDimension: 'ecs:service:DesiredCount',
    });
    expect(stagingConfig.apiScaling).toEqual({
      minTasks: 1,
      maxTasks: 2,
      cpuTargetPercent: 60,
    });
    template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
      PolicyType: 'TargetTrackingScaling',
      TargetTrackingScalingPolicyConfiguration: {
        PredefinedMetricSpecification: { PredefinedMetricType: 'ECSServiceAverageCPUUtilization' },
        TargetValue: stagingConfig.apiScaling.cpuTargetPercent,
      },
    });
  });

  it('allows the App stack to deploy with zero API tasks for database migrations', () => {
    const template = createAppTemplate(undefined, true);
    const services = Object.values(template.findResources('AWS::ECS::Service'));
    expect(services).toHaveLength(1);
    expect(services[0]?.Properties.DesiredCount).toBe(0);

    const targets = Object.values(
      template.findResources('AWS::ApplicationAutoScaling::ScalableTarget'),
    ).filter((target) => target.Properties.ServiceNamespace === 'ecs');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.Properties.MinCapacity).toBe(0);
  });

  it('creates a 30-day log group with delete-on-stack-removal behavior', () => {
    const template = createAppTemplate();
    const logGroups = Object.values(template.findResources('AWS::Logs::LogGroup'));
    expect(logGroups).toHaveLength(1);
    expect(logGroups[0]).toMatchObject({
      DeletionPolicy: 'Delete',
      Properties: { RetentionInDays: 30 },
    });
  });

  it('creates an HTTPS-only ALB with a secret-header rule and health-checked target', () => {
    const template = createAppTemplate();
    const loadBalancers = Object.values(
      template.findResources('AWS::ElasticLoadBalancingV2::LoadBalancer'),
    );
    expect(loadBalancers).toHaveLength(1);
    expect(loadBalancers[0]?.Properties).toMatchObject({ Scheme: 'internet-facing' });

    const listeners = Object.values(
      template.findResources('AWS::ElasticLoadBalancingV2::Listener'),
    );
    expect(listeners).toHaveLength(1);
    expect(listeners[0]?.Properties).toMatchObject({
      Port: 443,
      Protocol: 'HTTPS',
      DefaultActions: [
        {
          Type: 'fixed-response',
          FixedResponseConfig: {
            StatusCode: '403',
            ContentType: 'text/plain',
            MessageBody: 'Forbidden',
          },
        },
      ],
    });

    const rules = Object.values(
      template.findResources('AWS::ElasticLoadBalancingV2::ListenerRule'),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.Properties).toMatchObject({
      Priority: 1,
      Conditions: [
        {
          Field: 'http-header',
          HttpHeaderConfig: {
            HttpHeaderName: 'X-Origin-Verify',
          },
        },
      ],
    });
    expect(JSON.stringify(rules[0]?.Properties?.Conditions)).toContain('resolve:secretsmanager');

    const targetGroups = Object.values(
      template.findResources('AWS::ElasticLoadBalancingV2::TargetGroup'),
    );
    expect(targetGroups).toHaveLength(1);
    expect(targetGroups[0]?.Properties).toMatchObject({
      Port: API_PORT,
      Protocol: 'HTTP',
      HealthCheckPath: '/health/live',
      HealthCheckIntervalSeconds: 15,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      TargetGroupAttributes: expect.arrayContaining([
        { Key: 'deregistration_delay.timeout_seconds', Value: '30' },
      ]),
    });
  });

  it('creates an origin A alias and validates image tags', () => {
    const template = createAppTemplate();
    const records = Object.values(template.findResources('AWS::Route53::RecordSet'));
    expect(records).toHaveLength(1);
    expect(records[0]?.Properties).toMatchObject({
      Name: `origin.${stagingConfig.domainName}.`,
      Type: 'A',
    });
    expect(records[0]?.Properties).toHaveProperty('AliasTarget');
    expect(
      JSON.stringify(createAppTemplate('release-123').findResources('AWS::ECS::TaskDefinition')),
    ).toContain(':release-123');
    expect(() => createAppTemplate('bad:tag')).toThrow('imageTag');
  });

  it('creates a two-AZ VPC with public and isolated subnets and no NAT gateways', () => {
    const template = createAppTemplate();
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
    const template = createAppTemplate();
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
    const template = createAppTemplate();
    const alb = getSecurityGroup(
      template,
      'Allow HTTPS from the CloudFront origin-facing network.',
    );
    const ingressRules = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'));
    const albIngress = ingressRules.filter((rule) => getIngressGroupId(rule) === alb.logicalId);

    expect(ingressRules).toHaveLength(3);
    expect(albIngress).toHaveLength(1);
    expect(albIngress[0]?.Properties).toMatchObject({
      IpProtocol: 'tcp',
      FromPort: 443,
      ToPort: 443,
      SourcePrefixListId: 'pl-xxxxxxxx',
    });
  });

  it('allows ECS API and database ingress only from the preceding security group', () => {
    const template = createAppTemplate();
    const alb = getSecurityGroup(
      template,
      'Allow HTTPS from the CloudFront origin-facing network.',
    );
    const ecs = getSecurityGroup(
      template,
      'Allow API traffic only from the application load balancer.',
    );
    const db = getSecurityGroup(template, 'Allow PostgreSQL traffic only from ECS tasks.');
    const ingressRules = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'));
    const ecsIngress = ingressRules.filter((rule) => getIngressGroupId(rule) === ecs.logicalId);
    const dbIngress = ingressRules.filter((rule) => getIngressGroupId(rule) === db.logicalId);

    expect(ecsIngress).toHaveLength(1);
    expect(ecsIngress[0]?.Properties).toMatchObject({
      IpProtocol: 'tcp',
      FromPort: API_PORT,
      ToPort: API_PORT,
      SourceSecurityGroupId: { 'Fn::GetAtt': [alb.logicalId, 'GroupId'] },
    });
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

  it('limits the task role to the required bucket prefixes and ECS Exec permissions', () => {
    const template = createAppTemplate();
    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const taskPolicy = policies.find((policy) =>
      JSON.stringify(policy.Properties?.PolicyDocument).includes(
        'ssmmessages:CreateControlChannel',
      ),
    );
    expect(taskPolicy).toBeDefined();
    const policyDocument = getProperties(taskPolicy).PolicyDocument;
    if (
      typeof policyDocument !== 'object' ||
      policyDocument === null ||
      !('Statement' in policyDocument)
    ) {
      throw new Error('Expected the task role policy to contain statements.');
    }
    const statements = policyDocument.Statement as Array<{
      Action: string | string[];
      Resource: unknown;
      Condition?: { StringLike?: Record<string, unknown> };
    }>;
    const actionsFor = (statement: (typeof statements)[number]): string[] =>
      Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const s3Statements = statements.filter((statement) =>
      actionsFor(statement).some((action) => action.startsWith('s3:')),
    );
    expect(s3Statements).toHaveLength(4);
    expect(s3Statements.every((statement) => JSON.stringify(statement.Resource) !== '"*"')).toBe(
      true,
    );

    const objectResourceJson = s3Statements
      .filter((statement) => actionsFor(statement).includes('s3:GetObject'))
      .map((statement) => JSON.stringify(statement.Resource));
    expect(objectResourceJson).toHaveLength(2);
    expect(objectResourceJson.some((resource) => resource.includes('assets/*'))).toBe(true);
    expect(objectResourceJson.some((resource) => resource.includes('submissions/*'))).toBe(true);

    const listStatements = s3Statements.filter((statement) =>
      actionsFor(statement).includes('s3:ListBucket'),
    );
    expect(
      listStatements.map((statement) => statement.Condition?.StringLike?.['s3:prefix']),
    ).toEqual(['assets/*', 'submissions/*']);

    const ecsExecActions = new Set([
      'ssmmessages:CreateControlChannel',
      'ssmmessages:CreateDataChannel',
      'ssmmessages:OpenControlChannel',
      'ssmmessages:OpenDataChannel',
      'logs:DescribeLogGroups',
      'logs:CreateLogStream',
      'logs:DescribeLogStreams',
      'logs:PutLogEvents',
    ]);
    expect(
      statements
        .flatMap(actionsFor)
        .every((action) => action.startsWith('s3:') || ecsExecActions.has(action)),
    ).toBe(true);
  });
});
