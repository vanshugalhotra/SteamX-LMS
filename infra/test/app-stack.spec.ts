import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { AppStack } from '../lib/app-stack.js';
import { API_PORT } from '../lib/constructs/network.js';
import { stagingConfig } from '../lib/environments/staging.js';

vi.setConfig({ testTimeout: 20000 });

function createAppTemplate(): Template {
  const app = new App();
  const stack = new AppStack(app, 'SteamxStagingApp', stagingConfig, {
    stackName: 'SteamxStagingApp',
    env: { account: '123456789012', region: stagingConfig.region },
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
    expect(secrets).toHaveLength(1);
    expect(secrets[0]?.Properties).not.toHaveProperty('Name');
    expect(secrets[0]?.Properties).toMatchObject({
      GenerateSecretString: {
        ExcludeCharacters: ' %+~#$&*()|[]{}:;<>?!\'/@"\\=`',
        SecretStringTemplate: JSON.stringify({ username: 'steamx_owner' }),
      },
    });
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
});
