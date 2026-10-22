# AWS Infrastructure

The CDK app in `infra/` deploys:

- **Private S3 bucket** — blocks public access, encrypts objects, requires HTTPS. Browser `PUT`/`GET`/`HEAD` allowed from configured CORS origins. Not versioned. Incomplete multipart uploads cleaned after 1 day.
- **Backend IAM user** — scoped to `assets/*` and `submissions/*` object prefixes.
- **Monthly $25 budget** — alerts at 80% actual + 100% forecast. Does not cap spending.

> **Staging only:** destroying the stack empties and deletes the bucket (all data lost).

## Deploy

Prerequisites: AWS CLI credentials with CDK deploy permissions, then one-time setup:

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1
```

Set required env vars before CDK commands:

```powershell
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
# Optional: override default CORS origins (http://localhost:3000, http://localhost:5173)
$env:STEAMX_CORS_ORIGINS = "http://localhost:5173"
```

Region: CDK context `region` → `AWS_REGION` → defaults to `ap-south-1`.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm infra:synth` | Synthesize stack template |
| `pnpm infra:diff` | Preview changes |
| `pnpm infra:deploy` | Deploy (requires approval for permission broadening) |
| `pnpm infra:test` | Run infrastructure assertions |
| `pnpm infra:destroy` | Delete `SteamxStagingStack` only — **deletes the bucket and all contents** |

CDK context `env` defaults to `staging`. Staging allows stack deletion; other environments retain the bucket with termination protection.

### After deploy

Stack outputs `BucketName`, `Region`, and `BackendUserName`. For local/staging backend:

1. Create an access key for the IAM user.
2. Add to `apps/backend/.env`: `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
3. On ECS, omit keys — use the task role instead.

> Before destroying staging: delete any manually created access key for the backend IAM user (CloudFormation can't delete users with active keys).

## Browser storage smoke test

Uploads to the real bucket from a local browser and checks metadata, signed URLs, downloads, range requests, and unsigned access.

```powershell
pnpm storage:smoke --port 5173
```

Requirements:

- Port must be free **and** listed in deployed CORS origins.
- `AWS_REGION`, `S3_BUCKET`, and backend access keys in `apps/backend/.env`.

Expected results: upload → 200, size mismatch → 403, unsigned GET → 403, range → 206. Click **Clean up** after testing.
