# AWS infrastructure

This guide describes the resources and storage operations implemented by the AWS CDK app in
`infra/`; production application hosting is only a proposal.

## Current stack

The CDK stack provisions:

- A private, encrypted S3 bucket with public access blocked and HTTPS enforced. It is not versioned;
  incomplete multipart uploads are removed after one day.
- Browser `PUT`, `GET`, and `HEAD` CORS access for configured origins.
- A backend IAM user with access to `assets/*` and `submissions/*`.
- A monthly USD 25 budget alert at 80% actual spend and 100% forecast spend. Alerts do not cap cost.

The default CDK context is `env=staging`, region `ap-south-1`. Staging stack deletion removes the
bucket and its objects. Other environment names retain the bucket and enable termination
protection. Review the planned changes and target account before deploying or deleting resources.

## Deploy and inspect

The deployer needs AWS credentials and CDK permissions. Install the CDK dependencies and bootstrap
the AWS account/region once:

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1
```

Set the required budget email before synthesizing. Optionally override the allowed bucket CORS
origins:

```powershell
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
$env:STEAMX_CORS_ORIGINS = "http://localhost:5173"
```

Review changes before deployment:

```powershell
pnpm infra:synth
pnpm infra:diff
pnpm infra:deploy
```

`pnpm infra:destroy` deletes `SteamxStagingStack`, including its bucket and bucket contents. The
stack outputs `BucketName`, `Region`, and `BackendUserName`.

For local use, configure the backend's `AWS_REGION` and `S3_BUCKET` from the stack outputs. Static
AWS credentials are optional, but `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must be set
together. The supported runtime variables and defaults are in
[`apps/backend/.env.example`](../../apps/backend/.env.example). The current stack does not create
ECS or an ECS task role; the [proposed AWS design](../architecture/aws-architecture.md) describes
the planned role-based deployment.

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
