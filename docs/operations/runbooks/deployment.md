# Deployment runbook

Prerequisites: AWS CLI configured for the target account, Docker with buildx, pnpm, Node ≥24.

## Deploy from scratch (new account)

```powershell
# 1. Install infra dependencies
pnpm infra:install

# 2. Bootstrap CDK in both regions
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/us-east-1

# 3. Deploy all stacks
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
pnpm --dir infra staging:deploy all

# 4. Create the first admin
pnpm --dir infra staging:create-admin admin@example.com "Admin Name"
```

After deploy, configure local backend `.env` with the Foundation stack outputs:

```text
S3_MEDIA_BUCKET=<MediaBucketName>
S3_UPLOADS_BUCKET=<UploadsBucketName>
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<manually-created local-dev key>
AWS_SECRET_ACCESS_KEY=<manually-created local-dev secret>
```

## Deploy a code change

```powershell
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
pnpm --dir infra staging:deploy app
```

This builds an ARM64 Docker image, tags it with the git SHA, pushes to ECR (skips if the tag
already exists), then runs `cdk deploy`. Migrations run automatically at container startup.

## Deploy frontend only

Build the SPA and sync to S3, then invalidate CloudFront:

```powershell
pnpm --dir apps/frontend build

# Get the bucket name and distribution ID from Foundation outputs
aws s3 sync apps/frontend/dist s3://<MediaBucketName>/spa/ --delete --region ap-south-1
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

## Stop staging (save cost)

```powershell
pnpm --dir infra staging:stop
```

Scales ECS to 0 and stops RDS. Remaining costs: stopped RDS storage, S3, CloudFront.

> [!NOTE]
> AWS automatically restarts stopped RDS instances after 7 days. If staging stays unused
> longer, re-run `staging:stop` or accept the brief cost.

## Restart staging

```powershell
pnpm --dir infra staging:start
```

Starts RDS, waits for available, restores ECS autoscaling, waits for service stable.

## Tear down staging

```powershell
# Remove the App stack (ECS, ALB) and stop RDS
pnpm --dir infra staging:destroy

# Remove Foundation (database, buckets, secrets — permanent data loss)
pnpm --dir infra staging:destroy-data

# Remove the Cert stack too (optional, usually leave it)
pnpm --dir infra staging:destroy-all
```

Each destructive step requires confirmation. `destroy-data` refuses if the App stack still exists
or `protectData` is true.

## Rollback a bad deploy

ECS deployment circuit breaker is enabled — if the new task fails health checks, ECS
automatically rolls back to the previous task definition.

To manually roll back:

```powershell
# Find the previous task definition revision
aws ecs describe-services --cluster steamx-staging --services api --region ap-south-1 --query "services[0].taskDefinition"

# Force a deploy with the previous revision
aws ecs update-service --cluster steamx-staging --service api --task-definition <previous-revision> --force-new-deployment --region ap-south-1
```

## Password reset for an admin

See [admin-recovery.md](admin-recovery.md).
