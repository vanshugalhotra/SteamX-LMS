# AWS infrastructure

This guide describes the resources and storage operations implemented by the AWS CDK app in
`infra/`; production application hosting is only a proposal.

## Stacks

`SteamxStagingStack` is the legacy stack, to be replaced. It provisions:

- A private, encrypted S3 bucket with public access blocked and HTTPS enforced. It is not versioned;
  incomplete multipart uploads are removed after one day.
- Browser `PUT`, `GET`, and `HEAD` CORS access for configured origins.
- A backend IAM user with access to `assets/*` and `submissions/*`.

`SteamxStagingBase` currently contains only the monthly USD 25 cost budget named
`steamx-staging-budget`, with alerts at 80% actual and 100% forecast spend. Alerts do not cap cost.
Base is persistent and survives teardown; the App stack (added later) is the part destroyed to save
cost.

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

Set the required budget email. The legacy bucket also supports an optional CORS override:

```powershell
$env:STEAMX_BUDGET_EMAIL = "YOUR_EMAIL_ADDRESS"
$env:STEAMX_CORS_ORIGINS = "http://localhost:5173"
```

Inspect and deploy either stack by name:

```powershell
pnpm infra:synth
pnpm infra:diff SteamxStagingBase
pnpm infra:deploy SteamxStagingBase
pnpm infra:diff SteamxStagingStack
pnpm infra:deploy SteamxStagingStack
```

`pnpm infra:destroy SteamxStagingStack` tears down the legacy stack, including its bucket and
contents. The legacy stack outputs `BucketName`, `Region`, and `BackendUserName`. Do not destroy
the persistent Base stack during normal teardown.

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
