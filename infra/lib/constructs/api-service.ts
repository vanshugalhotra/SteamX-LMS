import {
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { API_PORT } from './network.js';
import type { EnvConfig } from '../environments/types.js';

export interface ApiServiceProps {
  config: EnvConfig;
  migrationsOnly: boolean;
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
  repository: ecr.IRepository;
  mediaBucket: s3.IBucket;
  uploadsBucket: s3.IBucket;
  jwtSecret: secretsmanager.ISecret;
  databaseUrlSecret: secretsmanager.ISecret;
}

export class ApiService extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiServiceProps) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: `steamx-${props.config.envName}`,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `steamx-${props.config.envName}-api`,
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [props.mediaBucket.arnForObjects('assets/*')],
      }),
    );
    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [props.mediaBucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': 'assets/*' } },
      }),
    );
    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [props.uploadsBucket.arnForObjects('submissions/*')],
      }),
    );
    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [props.uploadsBucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': 'submissions/*' } },
      }),
    );

    props.databaseUrlSecret.grantRead(executionRole);
    props.jwtSecret.grantRead(executionRole);

    this.logGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/steamx/${props.config.envName}/api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const imageTag = resolveImageTag(this);
    const container = taskDefinition.addContainer('ApiContainer', {
      containerName: 'api',
      image: ecs.ContainerImage.fromEcrRepository(props.repository, imageTag),
      environment: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        AWS_REGION: props.config.region,
        S3_MEDIA_BUCKET: props.mediaBucket.bucketName,
        S3_UPLOADS_BUCKET: props.uploadsBucket.bucketName,
        CORS_ORIGINS: props.config.appOrigin,
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(props.databaseUrlSecret),
        AUTH_JWT_SECRET: ecs.Secret.fromSecretsManager(props.jwtSecret),
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: this.logGroup,
        streamPrefix: 'api',
      }),
      stopTimeout: Duration.seconds(30),
    });
    container.addPortMappings({ containerPort: API_PORT });

    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      serviceName: 'api',
      desiredCount: props.migrationsOnly ? 0 : props.config.apiScaling.minTasks,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: true,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(60),
    });
    const scaling = props.config.apiScaling;
    this.service
      .autoScaleTaskCount({
        minCapacity: props.migrationsOnly ? 0 : scaling.minTasks,
        maxCapacity: scaling.maxTasks,
      })
      .scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: scaling.cpuTargetPercent,
      });
  }
}

function resolveImageTag(scope: Construct): string {
  const imageTag: unknown = scope.node.tryGetContext('imageTag');
  if (imageTag === undefined) {
    return 'missing-image-tag';
  }
  if (typeof imageTag !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(imageTag)) {
    throw new Error('CDK context imageTag must match ^[A-Za-z0-9_.-]{1,128}$.');
  }
  return imageTag;
}
