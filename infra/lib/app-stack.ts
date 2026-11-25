import { CfnOutput, Stack, Tags } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';
import { Network } from './constructs/network.js';
import { Database } from './constructs/database.js';

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, config: EnvConfig, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    const network = new Network(this, 'Network');
    const database = new Database(this, 'Database', {
      vpc: network.vpc,
      securityGroup: network.dbSg,
      instanceType: config.dbInstanceType,
      backupRetentionDays: config.dbBackupRetentionDays,
      maxAllocatedStorageGb: config.dbMaxAllocatedStorageGb,
      retainOnDelete: config.protectData,
    });

    new CfnOutput(this, 'DatabaseEndpointAddress', {
      value: database.instance.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, 'DatabaseCredentialsSecretArn', {
      value: database.secret.secretArn,
    });
  }
}
