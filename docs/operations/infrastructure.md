# AWS infrastructure

This guide describes the resources and storage operations implemented by the AWS CDK app in
`infra/`; production application hosting is not deployed yet.

## Stacks

`SteamxStagingBase` owns the monthly USD 25 cost budget named `steamx-staging-budget` (alerts at
80% actual and 100% forecast; alerts do not cap cost), and all storage buckets. It is a separate
stack from `SteamxStagingApp`, so Base and its storage survive App teardown. Destroying Base deletes
the buckets and their contents. The `media` bucket is for curriculum media and SPA assets;
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

The backend needs the RDS CA bundle to validate TLS certificates (tracked in `BE-INFRA`). Staging
App teardown deletes the database and its data, with no restoration copy. Run the staging `up`
procedure afterward to reseed data. The first RDS instance create takes about 10 minutes.

The environment defaults to `staging`; select it with CDK context `--context env=staging`. Staging
is the only defined environment. The region resolves from CDK context `region`, then `AWS_REGION`,
then `ap-south-1`. The account resolves from `CDK_DEFAULT_ACCOUNT`. Set `STEAMX_BUDGET_EMAIL`
before synthesizing or deploying.

## Deploy and inspect

The deployer needs AWS credentials and CDK permissions. Install the CDK dependencies and bootstrap
the target AWS account/region once:

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/REGION
```

Set the required budget email:

```powershell
$env:STEAMX_BUDGET_EMAIL = "YOUR_EMAIL_ADDRESS"
```

The root `infra:synth` script synthesizes both current stacks. The `infra:diff`, `infra:deploy`, and
`infra:destroy` scripts accept a stack name; target Base or App explicitly. For example:

```powershell
pnpm infra:synth
pnpm infra:diff SteamxStagingBase
pnpm infra:deploy SteamxStagingBase
pnpm infra:diff SteamxStagingApp
pnpm infra:deploy SteamxStagingApp
```

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
