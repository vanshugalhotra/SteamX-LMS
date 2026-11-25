#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { loadEnvironmentConfig } from '../lib/environments/index.js';
import { stagingConfig } from '../lib/environments/staging.js';
import { AppStack } from '../lib/app-stack.js';
import { BaseStack } from '../lib/base-stack.js';

const app = new App();
const baseEnvironment = loadEnvironmentConfig(
  stagingConfig,
  {
    env: app.node.tryGetContext('env'),
    region: app.node.tryGetContext('region'),
  },
  process.env,
);
const baseStackName = `Steamx${baseEnvironment.config.envName[0]?.toUpperCase()}${baseEnvironment.config.envName.slice(1)}Base`;
const appStackName = `Steamx${baseEnvironment.config.envName[0]?.toUpperCase()}${baseEnvironment.config.envName.slice(1)}App`;

new AppStack(app, appStackName, baseEnvironment.config, {
  stackName: appStackName,
  env: {
    account: baseEnvironment.account,
    region: baseEnvironment.config.region,
  },
});

new BaseStack(app, baseStackName, baseEnvironment.config, baseEnvironment.budgetEmail, {
  stackName: baseStackName,
  env: {
    account: baseEnvironment.account,
    region: baseEnvironment.config.region,
  },
});
