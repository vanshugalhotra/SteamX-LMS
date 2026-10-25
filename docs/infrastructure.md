# AWS Infrastructure

The CDK app in `infra/` deploys:

- **Private S3 bucket** — blocks public access, encrypts objects, requires HTTPS. Browser `PUT`/`GET`/`HEAD` allowed from configured CORS origins. Not versioned. Incomplete multipart uploads cleaned after 1 day. Presigned upload URLs include `If-None-Match: *`, so each key accepts exactly one upload — retries must use a new key.
- **Backend IAM user** — scoped to `assets/*` and `submissions/*` object prefixes with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and prefix-conditioned `s3:ListBucket`.
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

| Command              | What it does                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| `pnpm infra:synth`   | Synthesize stack template                                                  |
| `pnpm infra:diff`    | Preview changes                                                            |
| `pnpm infra:deploy`  | Deploy (requires approval for permission broadening)                       |
| `pnpm infra:test`    | Run infrastructure assertions                                              |
| `pnpm infra:destroy` | Delete `SteamxStagingStack` only — **deletes the bucket and all contents** |

CDK context `env` defaults to `staging`. Staging allows stack deletion; other environments retain the bucket with termination protection.

### After deploy

Stack outputs `BucketName`, `Region`, and `BackendUserName`. For local/staging backend:

1. Create an access key for the IAM user.
2. Add to `apps/backend/.env`: `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
3. On ECS, omit keys — use the task role instead.

> Before destroying staging: delete any manually created access key for the backend IAM user (CloudFormation can't delete users with active keys).

### Backend environment variables

These names, defaults, and bounds match `apps/backend/src/config/env.schema.ts`. AWS access keys
are optional, but must be set together. `CORS_ORIGINS` must be non-empty in production.

| Variable                                     | Default / requirement                                  |
| -------------------------------------------- | ------------------------------------------------------ |
| `NODE_ENV`                                   | `development` (`development`, `test`, or `production`) |
| `PORT`                                       | `3333`; integer 1–65535                                |
| `LOG_LEVEL`                                  | `info`                                                 |
| `DATABASE_URL`                               | Required                                               |
| `DB_POOL_MAX`                                | `10`; integer 1–50                                     |
| `DB_CONNECTION_TIMEOUT_MS`                   | `5000`; integer at least 1000                          |
| `AUTH_JWT_SECRET`                            | Required; at least 32 characters                       |
| `AUTH_TOKEN_TTL_SECONDS`                     | `86400`; integer at least 60                           |
| `CORS_ORIGINS`                               | Empty outside production; comma-separated valid URLs   |
| `SWAGGER_ENABLED`                            | Defaults to enabled only in development                |
| `AWS_REGION`, `S3_BUCKET`                    | Required                                               |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Optional pair; omit both when using an AWS role        |
| `UPLOAD_URL_TTL_SECONDS`                     | `900`; positive integer up to 3600                     |
| `CLEANUP_ENABLED`                            | `true`                                                 |
| `CLEANUP_INTERVAL_SECONDS`                   | `300`; integer at least 10                             |
| `CLEANUP_BATCH_SIZE`                         | `50`; positive integer                                 |
| `ASSET_STALE_FILE_AFTER_HOURS`               | `24`; integer at least 1                               |
| `ASSET_MAX_BYTES_IMAGE`                      | 10 MiB; positive integer                               |
| `ASSET_MAX_BYTES_PDF`                        | 50 MiB; positive integer                               |
| `ASSET_MAX_BYTES_VIDEO`                      | 1 GiB; positive integer                                |
| `ASSET_ACCESS_TTL_IMAGE_SECONDS`             | `600`; positive integer up to 43,200                   |
| `ASSET_ACCESS_TTL_PDF_SECONDS`               | `1800`; positive integer up to 43,200                  |
| `ASSET_ACCESS_TTL_VIDEO_SECONDS`             | `7200`; positive integer up to 43,200                  |

Cleanup runs in the API process with a self-rescheduling, unref'd timer. It processes bounded
batches; failed queue entries are retried on every run. Prefix deletion waits for the upload URL
TTL plus five minutes to protect against late uploads. Non-READY stale files and empty, unreferenced
assets are removed; READY files are retained. Set `CLEANUP_ENABLED=false` in automated tests.

#### Storage cleanup queue smoke test

Run this against an idle local database and a test bucket; it creates and deletes two temporary
objects and queue entries:

```powershell
pnpm --dir apps/backend storage:cleanup:smoke
```

It calls the queue drain directly, so it does not wait for the scheduler interval. The eligible
entry is backdated past the upload-link lifetime and grace period; the young entry should remain
pending. It refuses to run if other eligible prefix entries already exist and removes only its own
objects and queue rows.

## Browser storage smoke test

Uploads to the real bucket from a local browser and checks metadata, signed URLs, downloads, range requests, and unsigned access.

```powershell
pnpm --dir apps/backend storage:smoke --port 5173
```

Requirements:

- Port must be free **and** listed in deployed CORS origins.
- `AWS_REGION`, `S3_BUCKET`, and backend access keys in `apps/backend/.env`.

Expected results: upload → 200, size mismatch → 403, unsigned GET → 403, range → 206. Click **Clean up** after testing.

## Asset upload API smoke test

With the backend running against the staging bucket and database, run this from the repository root:

```powershell
pnpm --dir apps/backend asset:smoke --port 5173
```

Open `http://localhost:5173` in a browser. The browser origin must be allowed by both the backend's
`CORS_ORIGINS` and the staging bucket CORS policy. The page asks for the backend URL, seeded admin credentials, an initial PNG, a different
replacement PNG, and a short MP4. It exercises authenticated asset creation, direct presigned
uploads, file-state reads, completion (including retrying before the first PNG upload), successful
replacement while the old file remains available, cleanup-queue insertion, and a failed replacement
that preserves the current READY file. It also checks idempotent completion, wrong-size upload
enforcement, and the MP4 playback-key value through narrow read-only database queries. It does not
display session cookies or presigned URLs.

The local smoke server binds only to `127.0.0.1` and needs `DATABASE_URL` from
`apps/backend/.env` for the playback-key check. After the run, the page prints S3 cleanup commands
for each created asset prefix. Replace `<bucket>` with the staging bucket and run those commands
with the `steamx-backend` AWS profile. The smoke test does not remove database rows; use an isolated
staging account/database for this manual test.

## Asset access URL smoke test

For a READY asset already in the database and S3, run:

```powershell
pnpm --dir apps/backend asset:access:smoke --port 5173
```

Open `http://localhost:5173`, enter the local backend URL, seeded admin credentials, and asset ID.
The page checks login, the `GET /assets/:id/access` response fields and `Cache-Control: no-store`,
checks a byte-range request returns `206`, then previews the image, PDF, or video without printing
the signed URL.
