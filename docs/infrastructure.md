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

Cleanup runs in the API process on a self-rescheduling `setTimeout().unref()` timer. Steps per run:

1. Drain storage cleanup queue (S3 prefix deletes for entries older than upload URL TTL + 5 min)
2. Delete stale non-READY asset files (older than `ASSET_STALE_FILE_AFTER_HOURS`)
3. Delete empty, unreferenced assets

The queue drain reads at most 20 pages of `CLEANUP_BATCH_SIZE` eligible prefix entries (1,000 per
run with the defaults). Stale-file and empty-asset cleanup each use one configured batch. Failed
prefix deletions remain pending and retry next run; there is no backoff or retry limit. Eligible
object-only entries are counted and skipped. Completed queue rows are retained, and cleanup does
not scan S3 for objects missing from the database. READY files are not stale-file cleanup candidates.
Set `CLEANUP_ENABLED=false` in automated tests.

Asset upload is direct to S3: the API creates an `UPLOADING` row and returns a presigned PUT URL;
the client uploads with the returned headers and calls the completion route. Completion checks S3
metadata and a 16-byte signature sample before the processor marks the file `READY`. Supported
uploads are JPEG/PNG/WEBP images, PDF, and MP4 video; PPTX is present in the database enum but
rejected by upload validation. See the [API test checklist](./api-testing.md#assets) for endpoint cases.

File deletion queues a prefix from a PostgreSQL trigger; the queue worker waits for the upload URL
TTL plus a 5-minute late-PUT grace period before deleting it. Submission-file deletion currently
queues an object-only entry, which the worker skips. There is no orphan-object reconciliation.

#### Storage cleanup queue smoke test

Validates queue drain against a real database and S3 bucket:

```powershell
pnpm --dir apps/backend storage:cleanup:smoke
```

Creates two temporary S3 objects and queue entries — one backdated (eligible), one young (pending).
Calls drain directly (no scheduler wait). Refuses to run if other eligible entries exist. Removes
only its own objects and rows.

## Browser storage smoke test

Tests upload, metadata, signed URLs, downloads, range requests, and unsigned access against the
real bucket.

```powershell
pnpm --dir apps/backend storage:smoke --port 5173
```

Port must be free **and** listed in deployed CORS origins. Requires `AWS_REGION`, `S3_BUCKET`, and
access keys in `apps/backend/.env`. Expected: upload → 200, size mismatch → 403, unsigned GET →
403, range → 206. Click **Clean up** after testing.

## Asset and lesson-content smoke test

Tests asset uploads and lesson content against a running backend and the real S3 bucket.

```powershell
pnpm assets:smoke
```

Open `http://localhost:5173`, enter the local backend URL and seeded admin credentials, then select
an initial PNG, a different replacement PNG, and a short MP4. The test makes a small PDF itself.
The page origin must be allowed by backend `CORS_ORIGINS` and bucket CORS. The server binds to
`127.0.0.1`; its API proxy only accepts asset routes and the course, module, lesson, and lesson
content routes needed for resources created by this run. It does not show credentials, cookies, or
signed URLs.

The checks cover PNG, PDF, and MP4 upload/completion; replacement and failed replacement; retry and
wrong-size handling; and the video playback key. They create a course, module, and lesson, save
rich text, accordion, image, PDF, video, and two-column blocks, then check read-back, no-op and stale
versions, asset summaries, S3 image/video/PDF access, replacing and unlinking an in-use image, and
deletion protection. **Run all** cleans up the lesson, module, course, asset records, and S3 objects.
The **Cleanup** button can repeat cleanup. `.smoke-state.json` records created IDs and S3 object
keys for cleanup verification:

```powershell
pnpm assets:smoke -- --verify-cleanup
```

Requires `DATABASE_URL`, `AWS_REGION`, `S3_BUCKET`, and the AWS credentials already used by the backend,
from `apps/backend/.env` or the AWS default credential chain. Use staging test data.

## Asset access URL smoke test

Tests `GET /assets/:id/access` for a READY asset already in the database and S3.

```powershell
pnpm --dir apps/backend asset:access:smoke --port 5173
```

Open `http://localhost:5173`, enter backend URL, admin credentials, and asset ID. Checks login,
response fields, `Cache-Control: no-store`, byte-range 206, then previews the file. Does not
display the signed URL.
