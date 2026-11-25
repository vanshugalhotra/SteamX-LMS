import {
  CfnOutput,
  Stack,
  Tags,
  aws_budgets as budgets,
  aws_certificatemanager as acm,
  aws_route53 as route53,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { ContainerRegistry } from './constructs/container-registry.js';
import { LocalDevAccess } from './constructs/local-dev-access.js';
import { PrivateBucket } from './constructs/private-bucket.js';
import type { EnvConfig } from './environments/types.js';

export class BaseStack extends Stack {
  public readonly repository: ContainerRegistry;
  public readonly hostedZone: route53.IHostedZone;
  public readonly originCertificate: acm.Certificate;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly originVerifySecret: secretsmanager.Secret;

  constructor(
    scope: Construct,
    id: string,
    config: EnvConfig,
    budgetEmail: string,
    props: StackProps = {},
  ) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    this.repository = new ContainerRegistry(this, 'ApiRepository', config.envName);
    this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domainName,
    });
    this.originCertificate = new acm.Certificate(this, 'OriginCertificate', {
      domainName: `origin.${config.domainName}`,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });
    this.originVerifySecret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      generateSecretString: {
        passwordLength: 40,
        excludePunctuation: true,
      },
    });

    const corsOrigins = [config.appOrigin, ...config.localDevCorsOrigins];
    const media = new PrivateBucket(this, 'Media', {
      corsOrigins,
      retainOnDelete: false,
    });
    const uploads = new PrivateBucket(this, 'Uploads', {
      corsOrigins,
      retainOnDelete: false,
    });
    // Keep this construct path so CloudFormation updates the existing local-dev user in place.
    const localDevAccess = new LocalDevAccess(this, 'DevStorage', config.envName, media, uploads);

    new CfnOutput(this, 'MediaBucketName', { value: media.bucketName });
    new CfnOutput(this, 'UploadsBucketName', { value: uploads.bucketName });
    new CfnOutput(this, 'LocalDevUserName', { value: localDevAccess.user.userName });
    new CfnOutput(this, 'ApiRepositoryName', { value: this.repository.repositoryName });
    new CfnOutput(this, 'ApiRepositoryUri', { value: this.repository.repositoryUri });
    new CfnOutput(this, 'OriginVerifySecretArn', {
      value: this.originVerifySecret.secretArn,
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
