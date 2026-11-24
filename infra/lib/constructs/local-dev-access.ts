import { aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { PrivateBucket } from './private-bucket.js';

const MEDIA_OBJECT_PREFIX = 'assets/*';
const UPLOADS_OBJECT_PREFIX = 'submissions/*';

export class LocalDevAccess extends Construct {
  readonly user: iam.User;

  constructor(
    scope: Construct,
    id: string,
    envName: string,
    media: PrivateBucket,
    uploads: PrivateBucket,
  ) {
    super(scope, id);

    this.user = new iam.User(this, 'LocalDevUser', {
      userName: `steamx-${envName}-local-dev`,
    });

    this.user.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`${media.bucketArn}/${MEDIA_OBJECT_PREFIX}`],
      }),
    );
    this.user.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`${uploads.bucketArn}/${UPLOADS_OBJECT_PREFIX}`],
      }),
    );
    this.user.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [media.bucketArn],
        conditions: { StringLike: { 's3:prefix': [MEDIA_OBJECT_PREFIX] } },
      }),
    );
    this.user.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [uploads.bucketArn],
        conditions: { StringLike: { 's3:prefix': [UPLOADS_OBJECT_PREFIX] } },
      }),
    );
  }
}
