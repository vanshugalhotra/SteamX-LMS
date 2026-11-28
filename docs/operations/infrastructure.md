# AWS infrastructure

This guide describes the resources and operations implemented by the AWS CDK app in `infra/`.

## Stacks

`SteamxStagingCert` runs in `us-east-1` and owns the DNS-validated ACM certificate for
`learn.version26.in`. CloudFront requires its viewer certificate to be in `us-east-1`; this is a
separate stack because the application resources run in `ap-south-1`.

`SteamxStagingFoundation` owns infrastructure that survives App teardown: VPC with public and
isolated subnets, the RDS PostgreSQL instance and its secrets, JWT and origin-verify secrets,
media and uploads S3 buckets, ECR repository, CloudFront distribution with the `learn` DNS record,
the regional ACM certificate for `origin.version26.in`, the local-dev IAM user, the ECS task
security group, and the monthly cost budget. The DB security group allows port 5432 only from
the ECS task security group.

`SteamxStagingApp` contains the ECS cluster, Fargate task definition, service, CPU autoscaling,
the internet-facing ALB (using the origin certificate from Foundation), the `origin` Route53
record, the CloudWatch log group, and task IAM roles. It also creates the ALB→task ingress rule
on the imported ECS security group. App depends on Foundation; Foundation never references App.
CloudFront reaches the ALB by hostname (`origin.version26.in`) only, not by CloudFormation
reference.

While App is destroyed, the SPA still loads from S3, but API requests return 502 because the
ALB origin is unavailable. Destroying Foundation deletes the buckets, database, and their
contents.

## protectData flag

Each environment config has a `protectData` boolean:

| Setting        | `false` (staging)                                                               | `true` (future prod)                          |
| -------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| RDS            | deletionProtection off, DESTROY, deleteAutomatedBackups, 1-day backup retention | deletionProtection on, RETAIN, 14-day backups |
| S3 buckets     | DESTROY + autoDeleteObjects                                                     | RETAIN, no autoDelete                         |
| ECR repository | DESTROY + emptyOnDelete                                                         | RETAIN                                        |
| Secrets        | DESTROY                                                                         | RETAIN                                        |
| Log group      | DESTROY                                                                         | RETAIN                                        |

Staging uses `protectData: false`. No production environment is currently defined.

## Storage

The `media` bucket is for curriculum media and SPA assets; `uploads` is for student submissions.
Both are private, versioned, HTTPS-only S3 buckets. Staging CORS allows the configured app origin
and local development origins `http://localhost:3000` and `http://localhost:5173`. Their keys are:

- `media`: `spa/` and `assets/<assetId>/<fileId>/original` or
  `assets/<assetId>/<fileId>/hls/`
- `uploads`: `submissions/<schoolId>/...`

Noncurrent object versions expire after 30 days, incomplete multipart uploads are aborted after one
day, and expired delete markers are removed. Current objects have no expiration.

Foundation creates a `steamx-staging-local-dev` IAM user for local backend access to these same
buckets: `assets/*` in `media` and `submissions/*` in `uploads`. CDK does not create access keys;
create local credentials manually in the AWS console when needed.

## Migrations

Migrations run automatically at container startup via `docker-entrypoint.sh`, which calls
`prisma migrate deploy` before starting the application. If there are no pending migrations the
command is a no-op. If migration fails, the container exits immediately. Prisma acquires a
PostgreSQL advisory lock, so concurrent migration attempts during rolling deploys are serialized
safely. The ECS health-check grace period and container start period are set to 120 seconds to
cover migration time.

Set `SKIP_MIGRATIONS=true` as a container environment variable to skip migrations on startup
(for example, a config-only redeploy or a manual scaling operation).

**Rule: migrations must be backward-compatible.** Because the old API tasks may still be running
during the ECS rolling update, every migration must be additive (expand) first. Destructive
changes (dropping columns, renaming) happen in a later release after all tasks run the new code.

A single `cdk deploy` of the App stack is sufficient on a cold start — no separate migration task
is needed.

## Lifecycle scripts

All scripts live in `infra/scripts/` and are exposed as `pnpm` scripts in `infra/package.json`.
Scripts are TypeScript run with `tsx` and work on Windows (no bash).

### staging:deploy [all|cert|foundation|app]

The deploy target is required; omitting it is an error. `all` deploys the Cert, Foundation, and App
stacks in order. A single target deploys only that stack. Runs `cdk diff` before each `cdk deploy`.
When targeting `app`:
builds the ARM64 Docker image, pushes it to ECR tagged with the git short SHA (skips if the tag
already exists), then runs `cdk deploy --exclusively -c imageTag=<sha>`. If RDS is stopped,
starts it first and waits for available.

### staging:stop

Sets ECS autoscaling min/max to 0, desired count to 0, and stops RDS.


### staging:start

Starts RDS, waits for available, restores autoscaling min/max from config, sets desired count to
min, and waits for service stable.

### staging:destroy

Runs `cdk destroy <Env>App --exclusively`, then stops RDS. Foundation and Cert remain.


### staging:destroy-data

Refuses if `protectData` is true or the App stack still exists. Requires typing the exact phrase
`destroy staging data`. Deletes access keys of the local-dev IAM user (CloudFormation cannot
delete a user that still has keys), then runs `cdk destroy <Env>Foundation --exclusively`.

### staging:destroy-all

Same as destroy-data, then also destroys the Cert stack.

### staging:create-admin \<steamxId\> [name]

Runs the existing `admin-create.js` script as a one-off ECS Fargate task (same task definition
and network configuration as the service). Takes the steamx ID and optional name as arguments;
prompts for the password. Waits for the task to complete and fails on a non-zero exit code.

## Web delivery

The single CloudFront distribution serves `learn.version26.in`. Its default behavior reads the
private `media` bucket's `spa/` prefix through Origin Access Control (OAC); `/api/*` and
`/health/*` go to the HTTPS ALB origin with the `X-Origin-Verify` header. The API behaviors
forward viewer cookies, authorization, origin, and query strings, but not the viewer `Host`.

| Path        | Origin and handling                                                          |
| ----------- | ---------------------------------------------------------------------------- |
| Default     | `media` bucket `spa/` via OAC; extension-less paths rewrite to `/index.html` |
| `/api/*`    | ALB `origin.version26.in`; all HTTP methods, uncached                        |
| `/health/*` | ALB `origin.version26.in`; GET/HEAD, uncached                                |

## Deploy from scratch

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/us-east-1
$env:STEAMX_BUDGET_EMAIL = "YOUR_EMAIL"
pnpm --dir infra staging:deploy all
```

Create the initial admin:

```powershell
pnpm --dir infra staging:create-admin admin@example.com "Admin Name"
```

## Configuration

The environment defaults to `staging`; select it with CDK context `--context env=staging`. Staging
is the only defined environment. The region resolves from CDK context `region`, then `AWS_REGION`,
then `ap-south-1`. Set `STEAMX_BUDGET_EMAIL` before synthesizing or deploying.

Configure the backend with the Foundation outputs:

```text
S3_MEDIA_BUCKET=<MediaBucketName>
S3_UPLOADS_BUCKET=<UploadsBucketName>
AWS_REGION=<region>
AWS_ACCESS_KEY_ID=<manually-created local-dev key>
AWS_SECRET_ACCESS_KEY=<manually-created local-dev secret>
```

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
