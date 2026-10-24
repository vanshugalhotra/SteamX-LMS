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

### Asset access URL TTLs

Set these optional backend environment variables in `apps/backend/.env` to override the defaults.
Values must be positive integers no greater than 43,200 seconds. S3 checks expiry on every request;
players and PDF viewers make repeated range requests, so TTLs must cover normal viewing. Clients
should request a new URL when a fetch returns `403`.

| Variable                         | Default |
| -------------------------------- | ------: |
| `ASSET_ACCESS_TTL_IMAGE_SECONDS` |     600 |
| `ASSET_ACCESS_TTL_PDF_SECONDS`   |    1800 |
| `ASSET_ACCESS_TTL_VIDEO_SECONDS` |    7200 |

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
