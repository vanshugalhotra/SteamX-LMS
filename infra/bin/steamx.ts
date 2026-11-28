#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { loadEnvironmentConfig } from '../lib/environments/index.js';
import { stagingConfig } from '../lib/environments/staging.js';
import { AppStack } from '../lib/app-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { EdgeCertificateStack } from '../lib/edge-certificate-stack.js';

const app = new App();
const environment = loadEnvironmentConfig(
  stagingConfig,
  {
    env: app.node.tryGetContext('env'),
    region: app.node.tryGetContext('region'),
  },
  process.env,
);
const config = environment.config;
const prefix = `Steamx${config.envName[0]?.toUpperCase()}${config.envName.slice(1)}`;

const certStack = new EdgeCertificateStack(app, `${prefix}Cert`, config, {
  stackName: `${prefix}Cert`,
  env: { account: config.account, region: 'us-east-1' },
  crossRegionReferences: true,
});

const foundationStack = new FoundationStack(
  app,
  `${prefix}Foundation`,
  config,
  environment.budgetEmail,
  {
    stackName: `${prefix}Foundation`,
    env: { account: config.account, region: config.region },
    edgeCertificate: certStack.certificate,
    crossRegionReferences: true,
  },
);
foundationStack.addStackDependency(certStack);

const appStack = new AppStack(app, `${prefix}App`, config, {
  vpc: foundationStack.network.vpc,
  ecsSg: foundationStack.network.ecsSg,
  albSg: foundationStack.network.albSg,
  repository: foundationStack.repository,
  mediaBucket: foundationStack.mediaBucket,
  uploadsBucket: foundationStack.uploadsBucket,
  hostedZone: foundationStack.hostedZone,
  originCertificate: foundationStack.originCertificate,
  jwtSecret: foundationStack.jwtSecret,
  originVerifySecret: foundationStack.originVerifySecret,
  databaseCredentialsSecret: foundationStack.database.secret,
  stackName: `${prefix}App`,
  env: { account: config.account, region: config.region },
});
appStack.addStackDependency(foundationStack);
