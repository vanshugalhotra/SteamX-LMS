import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const API_PORT = 3333;

const CLOUDFRONT_ORIGIN_PREFIX_LIST = 'com.amazonaws.global.cloudfront.origin-facing';

export class Network extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      description: 'Allow HTTPS from the CloudFront origin-facing network.',
    });

    const cloudFrontPrefixList = ec2.PrefixList.fromLookup(this, 'CloudFrontOriginPrefixList', {
      prefixListName: CLOUDFRONT_ORIGIN_PREFIX_LIST,
    });
    // The prefix list includes every CloudFront distribution; a later change adds a secret header check.
    this.albSg.addIngressRule(cloudFrontPrefixList, ec2.Port.tcp(443), 'HTTPS from CloudFront');

    this.ecsSg = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Allow API traffic only from the application load balancer.',
      allowAllOutbound: true,
    });
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(API_PORT), 'API traffic from ALB');

    this.dbSg = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: this.vpc,
      description: 'Allow PostgreSQL traffic only from ECS tasks.',
      allowAllOutbound: false,
    });
    this.dbSg.addIngressRule(this.ecsSg, ec2.Port.tcp(5432), 'PostgreSQL from ECS');
  }
}
