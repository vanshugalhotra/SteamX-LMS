import { Duration, RemovalPolicy, aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface PrivateBucketProps {
  corsOrigins: string[];
  retainOnDelete: boolean;
}

export class PrivateBucket extends s3.Bucket {
  constructor(scope: Construct, id: string, props: PrivateBucketProps) {
    super(scope, id, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          expiredObjectDeleteMarker: true,
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: props.corsOrigins,
          allowedHeaders: ['Content-Type', 'Content-Length', 'If-None-Match', 'Range'],
          exposedHeaders: ['ETag', 'Content-Disposition'],
          maxAge: 3000,
        },
      ],
      removalPolicy: props.retainOnDelete ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !props.retainOnDelete,
    });
  }
}
