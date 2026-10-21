#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { getInfrastructureConfig } from '../lib/config.js';
import { SteamxStack } from '../lib/steamx-stack.js';

const app = new App();
const environmentName = String(app.node.tryGetContext('env') ?? 'staging');
const region = String(app.node.tryGetContext('region') ?? process.env.AWS_REGION ?? 'ap-south-1');
const config = getInfrastructureConfig(environmentName, process.env, region);
const stackName = `Steamx${environmentName[0]?.toUpperCase()}${environmentName.slice(1)}Stack`;

new SteamxStack(app, stackName, config, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
  terminationProtection: config.terminationProtection,
});
