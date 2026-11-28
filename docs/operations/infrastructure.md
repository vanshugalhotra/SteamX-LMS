# AWS infrastructure

CDK app in `infra/`. Region: `ap-south-1`.

## Stacks

| Stack             | Region       | Contains                                                                   |
| ----------------- | ------------ | -------------------------------------------------------------------------- |
| `<Env>Cert`       | `us-east-1`  | ACM certificate for `learn.<domain>` (CloudFront requires us-east-1)       |
| `<Env>Foundation` | `ap-south-1` | VPC, RDS, secrets, S3 buckets, ECR, CloudFront, local-dev IAM user, budget |
| `<Env>App`        | `ap-south-1` | ECS cluster, Fargate service, ALB, Route53 `origin` record, log group      |

App depends on Foundation. Foundation never references App. Destroying App leaves the SPA
working but API calls return 502. Destroying Foundation deletes all data.

## protectData flag

| Resource             | `false` (staging)                              | `true` (future prod)                        |
| -------------------- | ---------------------------------------------- | ------------------------------------------- |
| RDS                  | DESTROY, no deletion protection, 1-day backups | RETAIN, deletion protection, 14-day backups |
| S3 buckets           | DESTROY + autoDeleteObjects                    | RETAIN                                      |
| ECR / Secrets / Logs | DESTROY                                        | RETAIN                                      |

## Storage

Two private, versioned, HTTPS-only S3 buckets:

- **media** — SPA build (`spa/`) and curriculum assets (`assets/<assetId>/<fileId>/...`)
- **uploads** — student submissions (`submissions/<schoolId>/...`)

Noncurrent versions expire after 30 days. Incomplete multipart uploads abort after 1 day.

The `steamx-<env>-local-dev` IAM user has scoped access to both buckets. CDK does not create
access keys; create them manually in the AWS console.

## Web delivery

| Path        | Origin                        | Notes                                           |
| ----------- | ----------------------------- | ----------------------------------------------- |
| Default     | `media` bucket `spa/` via OAC | Extension-less paths rewrite to `/index.html`   |
| `/api/*`    | ALB `origin.<domain>`         | All methods, uncached, `X-Origin-Verify` header |
| `/health/*` | ALB `origin.<domain>`         | GET/HEAD, uncached                              |

## Migrations

Migrations run automatically at container startup (`docker-entrypoint.sh` → `prisma migrate
deploy`). No-op when nothing is pending. Prisma acquires a PostgreSQL advisory lock to handle
concurrent attempts during rolling deploys. Set `SKIP_MIGRATIONS=true` to skip.

**Rule:** migrations must be backward-compatible — expand first, contract in a later release.

## Lifecycle scripts

All in `infra/scripts/`, exposed via `pnpm` scripts. TypeScript + tsx, works on Windows.

| Command                                  | What it does                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `staging:deploy [all\|cert\|foundation\|app]` | Deploy the requested stack(s). App: builds ARM64 image → pushes to ECR → `cdk deploy`. Starts RDS if stopped. |
| `staging:start`                          | Start RDS, restore ECS autoscaling, wait for stable.                                                          |
| `staging:stop`                           | Scale ECS to 0, stop RDS.                                                                                     |
| `staging:destroy`                        | Destroy App stack, stop RDS. Requires confirmation.                                                           |
| `staging:destroy-data`                   | Destroy Foundation (all data). Requires `protectData: false`, App already destroyed, and confirmation phrase. |
| `staging:destroy-all`                    | Destroy Foundation + Cert. Same guards as destroy-data.                                                       |
| `staging:create-admin <id> [name]`       | Run admin-create as a one-off ECS task. Prompts for password.                                                 |
