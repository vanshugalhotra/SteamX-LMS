import { Stack, Tags, aws_certificatemanager as acm, aws_route53 as route53 } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { EnvConfig } from './environments/types.js';

export class EdgeCertificateStack extends Stack {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, config: EnvConfig, props: StackProps = {}) {
    super(scope, id, props);

    Tags.of(this).add('project', 'steamx');
    Tags.of(this).add('environment', config.envName);

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domainName,
    });
    const hostname = new URL(config.appOrigin).hostname;
    this.certificate = new acm.Certificate(this, 'AppCertificate', {
      domainName: hostname,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}
