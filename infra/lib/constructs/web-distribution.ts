import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as route53Targets,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { aws_certificatemanager as acm } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface WebDistributionProps {
  appOrigin: string;
  domainName: string;
  hostedZone: route53.IHostedZone;
  mediaBucket: s3.IBucket;
  certificate: acm.ICertificate;
  originVerifySecret: secretsmanager.ISecret;
}

export class WebDistribution extends cloudfront.Distribution {
  constructor(scope: Construct, id: string, props: WebDistributionProps) {
    const hostname = new URL(props.appOrigin).hostname;
    const apiOrigin = new origins.HttpOrigin(`origin.${props.domainName}`, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: {
        // This emits a Secrets Manager dynamic reference, so the value is never in the template.
        'X-Origin-Verify': props.originVerifySecret.secretValue.unsafeUnwrap(),
      },
    });
    const spaRewrite = new cloudfront.Function(scope, 'SpaRewrite', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: fileURLToPath(new URL('../edge/spa-rewrite.js', import.meta.url)),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    super(scope, id, {
      domainNames: [hostname],
      certificate: props.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(props.mediaBucket, {
          originPath: '/spa',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: spaRewrite,
          },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/health/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new route53.ARecord(scope, 'AppAlias', {
      zone: props.hostedZone,
      recordName: 'learn',
      target: route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this)),
    });

    new CfnOutput(scope, 'DistributionId', { value: this.distributionId });
    new CfnOutput(scope, 'DistributionDomainName', { value: this.distributionDomainName });
    new CfnOutput(scope, 'AppUrl', { value: props.appOrigin });
  }
}
