# AWS infrastructure

The CDK application in `infra/` currently deploys three things: a private S3 bucket for assets,
a backend IAM user scoped to the `assets/*` and `submissions/*` object prefixes, and a monthly
cost budget. The application, database, and web hosting are not deployed to AWS yet.

The bucket blocks public access, encrypts objects, requires HTTPS, and allows browser `PUT`, `GET`,
and `HEAD` requests from the configured CORS origins. It allows all request headers and exposes
`ETag` and `Content-Disposition`. It is not versioned. In staging, destroying the stack empties
and deletes the bucket, so all its data is permanently lost. Incomplete multipart uploads are
removed after one day. The $25 monthly budget sends alerts at 80% actual spend and 100% forecast;
it does not cap spending.

## Deploy

Run commands from the repository root. Configure AWS CLI credentials for an identity that can
deploy the CDK stack, then install the isolated infrastructure dependencies and bootstrap the
account/region once:

```powershell
pnpm infra:install
pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1
```

Replace `ACCOUNT_ID` and `ap-south-1` with the target account and region. Set the required budget
email in the shell before running CDK commands. CDK reads shell variables, not `.env.example`:

```powershell
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
```

The deployment region is selected from CDK context `region`, then `AWS_REGION`, and defaults to
`ap-south-1`. The default browser origins are `http://localhost:3000` and
`http://localhost:5173`. Override them with `STEAMX_CORS_ORIGINS`, a comma-separated list of full
origins.

- `pnpm infra:synth` synthesizes the stack template.
- `pnpm infra:diff` previews changes.
- `pnpm infra:deploy` deploys and requires approval for permission broadening.
- `pnpm infra:test` runs infrastructure assertions.
- `pnpm infra:destroy` deletes only `SteamxStagingStack` in the staging environment. It deletes
  the staging bucket and its contents; it does not remove CDK bootstrap resources or reset the
  AWS account.

The CDK context `env` defaults to `staging`. Staging allows stack deletion; other environments
retain the bucket and enable termination protection. The root `infra:destroy` command explicitly
targets staging.

The stack outputs `BucketName`, `Region`, and `BackendUserName`. For local/staging backend access,
create an access key for that IAM user and put the output bucket name, region, and both key values
in `apps/backend/.env` as `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY`. The stack creates the user, but not its access key. The backend can omit
both keys when using an AWS credential provider such as an ECS task role.

Before destroying staging, delete any manually created access key for the backend IAM user; an IAM
user with access keys cannot be deleted by CloudFormation. Check the planned stack operation and
confirm that the target is staging before approving deletion.

## Browser storage smoke test

The manual test uploads to the real bucket from a local browser and checks metadata, signed size and
content type, downloads, range requests, and unsigned access. It creates objects under a unique
`assets/<id>/` prefix and deletes that prefix with the page's **Clean up** button or on Ctrl+C.

The test page's exact origin must be present in the bucket's deployed CORS configuration, and its
port must be free. If the origin needs changing, set the budget email and CORS origins in the shell
and redeploy. For example:

```powershell
$env:STEAMX_BUDGET_EMAIL = "alerts@example.com"
$env:STEAMX_CORS_ORIGINS = "http://localhost:5173"
pnpm infra:deploy
```

Put `AWS_REGION`, `S3_BUCKET`, and the backend access-key pair in `apps/backend/.env`, then run:

```powershell
pnpm storage:smoke --port 5173
```

Use a port that is both free and listed in the deployed CORS origins. The results show HTTP status
and S3 error code; successful upload is 200, signed request mismatches should be 403
`SignatureDoesNotMatch`, unsigned GET should be 403, and the range check should be 206. Run the
test in each target browser, click **Clean up**, and confirm the run's prefix is gone in S3. If the
process is force-stopped or cleanup fails, delete that prefix manually.
