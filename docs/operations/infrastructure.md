# AWS infrastructure

This guide describes the resources and operations implemented by the AWS CDK app in `infra/`.

## Stacks

`SteamxStagingCert` runs in `us-east-1` and owns the DNS-validated ACM certificate for
`learn.version26.in`. CloudFront requires its viewer certificate to be in `us-east-1`; this is a
separate stack because the application resources run in `ap-south-1`.

`SteamxStagingBase` owns the monthly USD 25 cost budget named `steamx-staging-budget` (alerts at
80% actual and 100% forecast; alerts do not cap cost), storage buckets, and the CloudFront
distribution with its `learn.version26.in` alias. It is separate from `SteamxStagingApp`, so the
distribution and storage survive App teardown. While App is destroyed, the SPA still loads from
S3, but API requests return 502 because the ALB origin is unavailable. Destroying Base deletes the
buckets and their contents. The `media` bucket is for curriculum media and SPA assets;
`uploads` is for student submissions. Both are private,
versioned, HTTPS-only S3 buckets. Staging CORS allows the configured app origin and the local
development origins `http://localhost:3000` and `http://localhost:5173`. Their keys are:

- `media`: `spa/` and `assets/<assetId>/<fileId>/original` or
  `assets/<assetId>/<fileId>/hls/`
- `uploads`: `submissions/<schoolId>/...`

Noncurrent object versions expire after 30 days, incomplete multipart uploads are aborted after one
day, and expired delete markers are removed. Current objects have no expiration. Consequently,
purged data can persist in noncurrent versions for up to 30 days.

Base creates a `steamx-staging-local-dev` IAM user for local backend access to these same buckets:
`assets/*` in `media` and `submissions/*` in `uploads`. CDK does not create access keys; create
local credentials manually in the AWS console when needed. Do not include localhost origins in
production CORS, and do not use static keys for deployed services.

Base storage replaces the previous S3/IAM-only CDK stack. Removing that stack from the CDK app does
not automatically delete an already-deployed CloudFormation stack; any remaining old resources
require separate cleanup.

`SteamxStagingApp` contains a VPC with two public `/24` subnets across two AZs and two isolated
`/24` subnets, with no NAT gateways or bastion, plus security groups.

The App stack also contains one encrypted, single-AZ PostgreSQL 18 RDS instance (`t4g.micro`)
with 20 GB gp3 storage and autoscaling capped at 25 GB in staging, in the isolated subnets. The
limit is environment-configured. It is not public and accepts traffic only from the ECS security
group. TLS is enforced with `rds.force_ssl=1`.
Staging retains automated backups for one day. Backups run at `19:00-19:30 UTC` and maintenance at
`sun:20:00-sun:20:30 UTC`, outside typical IST working hours.

The instance has a generated Secrets Manager JSON secret containing the `steamx_owner` credentials.
The secret has no fixed physical name so that staging App teardown and recreation do not encounter
a deleted secret scheduled for recovery. The owner/migration user is used by the app initially.
A separate least-privilege application user is a documented hardening item; implementing it requires
purge procedures and triggers to have their required privileges planned first.

The App stack runs the API on ARM64 Fargate behind an internet-facing HTTPS ALB. The ALB accepts
443 only from the CloudFront managed prefix list and forwards requests only when the
`X-Origin-Verify` header matches the generated origin verification secret. The task role is scoped
to the media `assets/` and uploads `submissions/` prefixes. ECS Exec is enabled. Task-count
autoscaling is configured per environment; staging runs 1–2 tasks and targets 60% average CPU.

The backend image includes the RDS global CA bundle and sets `NODE_EXTRA_CA_CERTS` and
`SSL_CERT_FILE` so Node.js and Prisma can validate RDS TLS certificates. These variables do not
force TLS for local non-TLS PostgreSQL.

Staging App teardown deletes the database and its data, with no restoration copy. Run the staging
`up` procedure afterward to reseed data. The first RDS instance create takes about 10 minutes.
Keep App deployed only while needed: the ALB and Fargate service incur ongoing costs, and the RDS
instance continues to incur costs while App exists. Destroy App when idle; Base is persistent and
survives App teardown.

The environment defaults to `staging`; select it with CDK context `--context env=staging`. Staging
is the only defined environment. The region resolves from CDK context `region`, then `AWS_REGION`,
then `ap-south-1`. The account resolves from `CDK_DEFAULT_ACCOUNT`. Set `STEAMX_BUDGET_EMAIL`
before synthesizing or deploying.

## Deploy and inspect

The deployer needs AWS credentials and CDK permissions. Install the CDK dependencies and bootstrap
the target AWS account/region once. CloudFront's certificate stack requires a bootstrap in
`us-east-1` as well as the application region:

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/REGION
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

Set the required budget email:

```powershell
$env:STEAMX_BUDGET_EMAIL = "YOUR_EMAIL_ADDRESS"
```

The root `infra:synth` script synthesizes all stacks. The `infra:diff`, `infra:deploy`, and
`infra:destroy` scripts accept a stack name; target Cert, Base, or App explicitly. For example:

```powershell
pnpm infra:synth
pnpm infra:diff SteamxStagingCert
pnpm infra:diff SteamxStagingBase
pnpm infra:deploy SteamxStagingBase
pnpm infra:diff SteamxStagingApp
pnpm infra:deploy SteamxStagingApp
```

Deploy Cert, then Base, then the API image, then App. Base depends on Cert. Use an immutable image
tag such as the Git commit SHA, and always pass the same tag as CDK context when deploying App. If
`imageTag` is omitted, the template uses `missing-image-tag`; that fallback is for synthesis and
teardown, not deployment.

```powershell
pnpm --dir infra exec cdk deploy SteamxStagingCert
pnpm --dir infra exec cdk deploy SteamxStagingBase
$region = "ap-south-1"
$accountId = "<account-id>"
$repositoryUri = "<ApiRepositoryUri output from Base>"
$imageTag = "<git-commit-sha>"
aws ecr get-login-password --region $region | docker login --username AWS --password-stdin "$accountId.dkr.ecr.$region.amazonaws.com"
docker buildx build --platform linux/arm64 -f apps/backend/Dockerfile --build-arg GIT_SHA=$imageTag -t "$repositoryUri`:$imageTag" --push .
pnpm --dir infra exec cdk deploy SteamxStagingApp --exclusively --context "imageTag=$imageTag" --context "migrationsOnly=true"
```

For an empty database, the first App deployment uses `migrationsOnly=true` to create the database,
network, task definition, and ECS service with zero API tasks. This avoids starting the API before
its migration-managed tables exist. Run the migration as a one-off Fargate task using the service's
task definition, network, and injected Secrets Manager values:

```powershell
$service = aws ecs describe-services --cluster steamx-staging --services api --region $region --query "services[0]" --output json | ConvertFrom-Json
$network = $service.networkConfiguration.awsvpcConfiguration
$networkConfiguration = "awsvpcConfiguration={subnets=[$($network.subnets -join ',')],securityGroups=[$($network.securityGroups -join ',')],assignPublicIp=$($network.assignPublicIp)}"
$migrationTask = aws ecs run-task --cluster steamx-staging --task-definition $service.taskDefinition --launch-type FARGATE --network-configuration $networkConfiguration --overrides '{"containerOverrides":[{"name":"api","command":["./node_modules/.bin/prisma","migrate","deploy"]}]}' --region $region --output json | ConvertFrom-Json
if ($migrationTask.failures -or $migrationTask.tasks.Count -ne 1) { throw ($migrationTask | ConvertTo-Json -Depth 8) }
$migrationTaskArn = $migrationTask.tasks[0].taskArn
aws ecs wait tasks-stopped --cluster steamx-staging --tasks $migrationTaskArn --region $region
$migrationExitCode = aws ecs describe-tasks --cluster steamx-staging --tasks $migrationTaskArn --region $region --query "tasks[0].containers[?name=='api']|[0].exitCode" --output text
if ($migrationExitCode -ne "0") { throw "Migration task failed with exit code $migrationExitCode" }
```

After migrations succeed, redeploy App without the `migrationsOnly` context to start the API tasks.
For staging releases that include migrations, this same sequence uses the new image and temporarily
scales the API to zero. It causes downtime. Production should instead run a migration task from the
new release image before the ECS rolling update, while the old compatible API tasks remain running;
the current CDK workflow does not automate that release gate.

Create the initial admin only during initial provisioning. For ECS Exec, find a running API task
in the ECS console or with `aws ecs list-tasks`, then substitute its ARN below. The API image is
slim and has no `curl`; check readiness with Node's built-in `fetch`:

```powershell
pnpm --dir infra exec cdk deploy SteamxStagingApp --exclusively --context "imageTag=$imageTag"
aws ecs execute-command --cluster steamx-staging --task "<task-arn>" --container api --interactive --command "node dist/scripts/admin-create.js"
aws ecs execute-command --cluster steamx-staging --task "<task-arn>" --container api --interactive --command "node -e `"fetch('http://127.0.0.1:3333/health/ready').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) }).catch(e => { console.error(e); process.exit(1) })`""
```

To test the origin-header rule from your workstation, temporarily add your public IP as a 443
ingress source on the ALB security group, then remove that rule immediately after testing. Send
`X-Origin-Verify` with the current origin verification secret to `https://origin.version26.in`;
a request without the header should return 403. For example, assign the Base output ARN and fetch
the secret into a shell variable (do not print it):

```powershell
$secretArn = "<OriginVerifySecretArn output from Base>"
$originVerifySecret = aws secretsmanager get-secret-value --secret-id $secretArn --query SecretString --output text
Invoke-WebRequest -Uri "https://origin.version26.in/health/live" -Headers @{ "X-Origin-Verify" = $originVerifySecret }
Remove-Variable originVerifySecret
```

Do not leave the temporary ingress rule in place.

For a rollback smoke test, deploy a deliberately bad image tag and observe the ECS deployment
circuit breaker revert to the prior task definition. It can take about 10–20 minutes for the
circuit breaker to give up. Immutable tags ensure the prior task definition still refers to its
original image. The origin verification secret is used by both the ALB and CloudFront; rotating it
requires redeploying both the origin and CloudFront configuration.

The backend `trust proxy` setting and throttler are part of the planned `BE-INFRA` work and are not
implemented by this infrastructure change.

The Base outputs include both bucket names and the local-dev user name. Configure the backend with
the media and uploads bucket outputs:

```text
S3_MEDIA_BUCKET=<MediaBucketName>
S3_UPLOADS_BUCKET=<UploadsBucketName>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<manually-created local-dev key>
AWS_SECRET_ACCESS_KEY=<manually-created local-dev secret>
```

Create local credentials manually in the AWS console, never in code. Deployed services do not use
static credentials. The backend routes `assets/` keys to media and `submissions/` keys to uploads.
The existing asset upload flow uses media; a student-submission file upload endpoint is not
implemented yet.

## Web delivery

The single CloudFront distribution serves `learn.version26.in`. Its default behavior reads the
private `media` bucket's `spa/` prefix through Origin Access Control (OAC); `/api/*` and `/health/*`
go to the HTTPS ALB origin with the `X-Origin-Verify` header. The API behaviors forward viewer
cookies, authorization, origin, and query strings, but not the viewer `Host`.

| Path        | Origin and handling                                                          |
| ----------- | ---------------------------------------------------------------------------- |
| Default     | `media` bucket `spa/` via OAC; extension-less paths rewrite to `/index.html` |
| `/api/*`    | ALB `origin.version26.in`; all HTTP methods, uncached                        |
| `/health/*` | ALB `origin.version26.in`; GET/HEAD, uncached                                |

`/health/*` must be routed to the API so the SPA rewrite does not answer health checks with
`index.html`. Missing static files return S3's 403 response; there are no custom error responses.
Cache lifetimes come from `Cache-Control` metadata on uploaded objects; CloudFront invalidation
automation is tracked by INFRA-9. CSP and the CloudFront flat-rate plan decision are deferred.

If AWS blocks distribution creation pending CloudFront account verification, complete the
verification requested in the AWS console, then retry deployment. Staging uses the Route 53 hosted
zone for `version26.in`; confirm production DNS hosting and delegation before go-live.

## Asset storage operations

Uploads go from the browser directly to S3 using an API-issued presigned PUT URL. The API creates
an `UPLOADING` file record first. Completion checks S3 metadata and file-signature bytes, then the
current processor marks supported files READY without transforming them. Upload types are JPEG,
PNG, WEBP, PDF, and MP4; PPTX exists in the schema but upload validation rejects it.

Deleting file records queues storage cleanup through a PostgreSQL trigger. The API process drains
eligible prefix entries after the upload URL lifetime plus a five-minute grace period, then
removes stale non-READY files and empty assets. Each drain handles at most 20 pages of
`CLEANUP_BATCH_SIZE`; failed prefix deletions stay queued for the next run. Object-only queue
entries are skipped, completed rows are retained, and the worker does not scan S3 for orphaned
objects. Set `CLEANUP_ENABLED=false` in automated tests.

## Live storage smoke tests

These are not unit tests: they use a running backend, a database, and a real S3 bucket. They create
temporary database records and/or S3 objects; use only a test bucket and clean up afterward.

| Command                                                  | Checks                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir apps/backend storage:cleanup:smoke`          | Drains test cleanup-queue entries against S3 and PostgreSQL.                                                     |
| `pnpm --dir apps/backend storage:smoke --port 5173`      | Browser upload, download, range, and unsigned-access behavior. The port must be free and allowed by bucket CORS. |
| `pnpm assets:smoke`                                      | Asset upload/replacement and lesson-content flows against the backend and S3.                                    |
| `pnpm --dir apps/backend asset:access:smoke --port 5173` | Temporary asset-access URL and byte-range behavior for an existing READY asset.                                  |

Use the [API testing guide](../testing/api-testing.md) for HTTP contract cases. Use
[testing seed data](../testing/testing-seed-data.md) only with a fresh development database.
