import {
  Duration,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { API_PORT } from './network.js';

export interface OriginLoadBalancerProps {
  vpc: ec2.IVpc;
  securityGroup: ec2.ISecurityGroup;
  service: ecs.FargateService;
  hostedZone: route53.IHostedZone;
  certificate: acm.ICertificate;
  originVerifySecret: secretsmanager.ISecret;
}

export class OriginLoadBalancer extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: OriginLoadBalancerProps) {
    super(scope, id);

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: props.securityGroup,
      deletionProtection: false,
    });
    const listener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [props.certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      open: false,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Forbidden',
      }),
    });
    // checkSecretUsage is enabled; this remains a Secrets Manager dynamic reference.
    const originVerifyValue = props.originVerifySecret.secretValue.unsafeUnwrap();
    listener.addTargets('ApiTarget', {
      priority: 1,
      conditions: [elbv2.ListenerCondition.httpHeader('X-Origin-Verify', [originVerifyValue])],
      targets: [
        props.service.loadBalancerTarget({ containerName: 'api', containerPort: API_PORT }),
      ],
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: '/health/live',
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    new route53.ARecord(this, 'OriginAlias', {
      zone: props.hostedZone,
      recordName: 'origin',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(this.loadBalancer),
      ),
    });
  }
}
