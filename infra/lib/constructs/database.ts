import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_rds as rds, aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DatabaseProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
  instanceType: string;
  backupRetentionDays: number;
  retainOnDelete: boolean;
}

export class Database extends Construct {
  public readonly instance: rds.DatabaseInstance;
  public readonly secret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const engine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_18,
    });
    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
      engine,
      parameters: {
        'rds.force_ssl': '1',
      },
    });

    this.instance = new rds.DatabaseInstance(this, 'Instance', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      engine,
      instanceType: new ec2.InstanceType(props.instanceType),
      instanceIdentifier: 'steamx',
      databaseName: 'steamx',
      credentials: rds.Credentials.fromGeneratedSecret('steamx_owner', {
        excludeCharacters: ' %+~#$&*()|[]{}:;<>?!\'/@"\\=`',
      }),
      parameterGroup,
      multiAz: false,
      publiclyAccessible: false,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageEncrypted: true,
      autoMinorVersionUpgrade: true,
      backupRetention: Duration.days(props.backupRetentionDays),
      preferredBackupWindow: '19:00-19:30',
      // 19:00 UTC is 00:30 IST; 20:00 UTC is 01:30 IST.
      preferredMaintenanceWindow: 'sun:20:00-sun:20:30',
      deletionProtection: props.retainOnDelete,
      deleteAutomatedBackups: !props.retainOnDelete,
      removalPolicy: props.retainOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    if (!this.instance.secret) {
      throw new Error('Generated RDS credentials secret was not attached to the instance.');
    }
    this.secret = this.instance.secret;
  }
}
