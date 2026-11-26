import {
  CfnOutput,
  Stack,
  Tags,
  aws_certificatemanager as acm,
  aws_ecr as ecr,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';
import { ApiService } from './constructs/api-service.js';
import { Network } from './constructs/network.js';
import { Database } from './constructs/database.js';
import { OriginLoadBalancer } from './constructs/origin-load-balancer.js';

export interface AppStackProps extends StackProps {
  repository: ecr.IRepository;
  mediaBucket: s3.IBucket;
  uploadsBucket: s3.IBucket;
  hostedZone: route53.IHostedZone;
  originCertificate: acm.ICertificate;
  jwtSecret: secretsmanager.ISecret;
  originVerifySecret: secretsmanager.ISecret;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, config: EnvConfig, props: AppStackProps) {
    const {
      repository,
      mediaBucket,
      uploadsBucket,
      hostedZone,
      originCertificate,
      jwtSecret,
      originVerifySecret,
      ...stackProps
    } = props;
    super(scope, id, stackProps);

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
    const api = new ApiService(this, 'Api', {
      config,
      vpc: network.vpc,
      ecsSecurityGroup: network.ecsSg,
      repository,
      mediaBucket,
      uploadsBucket,
      jwtSecret,
      databaseUrlSecret: database.urlSecret,
    });
    const origin = new OriginLoadBalancer(this, 'Origin', {
      vpc: network.vpc,
      securityGroup: network.albSg,
      service: api.service,
      hostedZone,
      certificate: originCertificate,
      originVerifySecret,
    });

    new CfnOutput(this, 'DatabaseEndpointAddress', {
      value: database.instance.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, 'DatabaseCredentialsSecretArn', {
      value: database.secret.secretArn,
    });
    new CfnOutput(this, 'ApiLoadBalancerDnsName', {
      value: origin.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, 'ApiOriginUrl', { value: `https://origin.${config.domainName}` });
    new CfnOutput(this, 'ApiClusterName', { value: api.cluster.clusterName });
    new CfnOutput(this, 'ApiServiceName', { value: api.service.serviceName });
    new CfnOutput(this, 'ApiLogGroupName', { value: api.logGroup.logGroupName });
  }
}
