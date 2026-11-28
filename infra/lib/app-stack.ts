import {
  CfnOutput,
  Stack,
  Tags,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';
import { ApiService } from './constructs/api-service.js';
import { OriginLoadBalancer } from './constructs/origin-load-balancer.js';

export interface AppStackProps extends StackProps {
  vpc: ec2.IVpc;
  ecsSg: ec2.ISecurityGroup;
  albSg: ec2.ISecurityGroup;
  repository: ecr.IRepository;
  mediaBucket: s3.IBucket;
  uploadsBucket: s3.IBucket;
  hostedZone: route53.IHostedZone;
  originCertificate: acm.ICertificate;
  jwtSecret: secretsmanager.ISecret;
  originVerifySecret: secretsmanager.ISecret;
  databaseCredentialsSecret: secretsmanager.ISecret;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, config: EnvConfig, props: AppStackProps) {
    const {
      vpc,
      ecsSg,
      albSg,
      repository,
      mediaBucket,
      uploadsBucket,
      hostedZone,
      originCertificate,
      jwtSecret,
      originVerifySecret,
      databaseCredentialsSecret,
      ...stackProps
    } = props;
    super(scope, id, stackProps);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    const api = new ApiService(this, 'Api', {
      config,
      vpc,
      ecsSecurityGroup: ecsSg,
      repository,
      mediaBucket,
      uploadsBucket,
      jwtSecret,
      databaseCredentialsSecret,
    });
    const origin = new OriginLoadBalancer(this, 'Origin', {
      vpc,
      securityGroup: albSg,
      ecsSecurityGroup: ecsSg,
      service: api.service,
      hostedZone,
      certificate: originCertificate,
      originVerifySecret,
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
