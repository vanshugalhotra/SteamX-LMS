import { App, Stack, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it, vi } from 'vitest';
import { Database } from '../lib/constructs/database.js';

vi.setConfig({ testTimeout: 20000 });

describe('Database', () => {
  it('retains and protects the instance when retainOnDelete is true', () => {
    const stack = new Stack(new App(), 'ProtectedDatabaseStack');
    const vpc = new ec2.Vpc(stack, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    const securityGroup = new ec2.SecurityGroup(stack, 'DatabaseSecurityGroup', { vpc });
    new Database(stack, 'Database', {
      vpc,
      securityGroup,
      instanceType: 't4g.micro',
      backupRetentionDays: 1,
      retainOnDelete: true,
    });

    const instances = Object.values(
      Template.fromStack(stack).findResources('AWS::RDS::DBInstance'),
    );
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      DeletionPolicy: 'Retain',
      Properties: { DeletionProtection: true },
    });
  });
});
