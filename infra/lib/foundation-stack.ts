import {
  CfnOutput,
  RemovalPolicy,
  Stack,
  Tags,
  aws_budgets as budgets,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_route53 as route53,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ContainerRegistry } from './constructs/container-registry.js';
import { Database } from './constructs/database.js';
import { LocalDevAccess } from './constructs/local-dev-access.js';
import { Network } from './constructs/network.js';
import { PrivateBucket } from './constructs/private-bucket.js';
import { WebDistribution } from './constructs/web-distribution.js';
import type { EnvConfig } from './environments/types.js';

export interface FoundationStackProps extends StackProps {
  edgeCertificate: acm.ICertificate;
}

/** Owns VPC, RDS, secrets, buckets, ECR, CloudFront, budget — everything that survives App teardown. */
export class FoundationStack extends Stack {
  public readonly repository: ContainerRegistry;
  public readonly mediaBucket: PrivateBucket;
  public readonly uploadsBucket: PrivateBucket;
  public readonly hostedZone: route53.IHostedZone;
  public readonly originCertificate: acm.Certificate;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly originVerifySecret: secretsmanager.Secret;
  public readonly database: Database;
  public readonly network: Network;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    budgetEmail: string,
    props: FoundationStackProps,
  ) {
    const { edgeCertificate, ...stackProps } = props;
    super(scope, id, stackProps);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    this.network = new Network(this, 'Network');

    this.repository = new ContainerRegistry(
      this,
      'ApiRepository',
      config.envName,
      config.protectData,
    );
    this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domainName,
    });
    this.originCertificate = new acm.Certificate(this, 'OriginCertificate', {
      domainName: `origin.${config.domainName}`,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    const removalPolicy = config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
      removalPolicy,
    });
    this.originVerifySecret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      generateSecretString: {
        passwordLength: 40,
        excludePunctuation: true,
      },
      removalPolicy,
    });

    const corsOrigins = [config.appOrigin, ...config.localDevCorsOrigins];
    this.mediaBucket = new PrivateBucket(this, 'Media', {
      corsOrigins,
      retainOnDelete: config.protectData,
    });
    this.uploadsBucket = new PrivateBucket(this, 'Uploads', {
      corsOrigins,
      retainOnDelete: config.protectData,
    });

    this.database = new Database(this, 'Database', {
      vpc: this.network.vpc,
      securityGroup: this.network.dbSg,
      instanceType: config.dbInstanceType,
      backupRetentionDays: config.dbBackupRetentionDays,
      maxAllocatedStorageGb: config.dbMaxAllocatedStorageGb,
      retainOnDelete: config.protectData,
    });

    // Keep this construct path so CloudFormation updates the existing local-dev user in place.
    const localDevAccess = new LocalDevAccess(
      this,
      'DevStorage',
      config.envName,
      this.mediaBucket,
      this.uploadsBucket,
    );

    new WebDistribution(this, 'WebDistribution', {
      appOrigin: config.appOrigin,
      domainName: config.domainName,
      hostedZone: this.hostedZone,
      mediaBucket: this.mediaBucket,
      certificate: edgeCertificate,
      originVerifySecret: this.originVerifySecret,
    });

    new CfnOutput(this, 'MediaBucketName', { value: this.mediaBucket.bucketName });
    new CfnOutput(this, 'UploadsBucketName', { value: this.uploadsBucket.bucketName });
    new CfnOutput(this, 'LocalDevUserName', { value: localDevAccess.user.userName });
    new CfnOutput(this, 'ApiRepositoryName', { value: this.repository.repositoryName });
    new CfnOutput(this, 'ApiRepositoryUri', { value: this.repository.repositoryUri });
    new CfnOutput(this, 'OriginVerifySecretArn', {
      value: this.originVerifySecret.secretArn,
    });
    new CfnOutput(this, 'DatabaseEndpointAddress', {
      value: this.database.instance.dbInstanceEndpointAddress,
    });
    new CfnOutput(this, 'DatabaseCredentialsSecretArn', {
      value: this.database.secret.secretArn,
    });

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `steamx-${config.envName}-budget`,
        budgetLimit: {
          amount: config.monthlyBudgetUsd,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: budgetEmail }],
        },
      ],
      resourceTags: [
        { key: 'project', value: 'steamx' },
        { key: 'environment', value: config.envName },
      ],
    });
  }
}
