import { Stack, Tags } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';
import { Network } from './constructs/network.js';

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, config: EnvConfig, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    new Network(this, 'Network');
  }
}
