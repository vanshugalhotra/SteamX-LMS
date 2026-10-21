# Staging infrastructure

The `infra/` CDK app currently creates one private S3 bucket, a narrowly scoped backend IAM user,
and a monthly AWS cost budget. Staging bucket deletion removes its objects. No application
resources are deployed yet.

## One-time AWS account setup

Create or select an AWS account, enable MFA for administrators, and create a dedicated deployer
identity with permission to deploy CDK resources and bootstrap the account. Configure AWS CLI
credentials for that identity, then bootstrap the CDK environment once with
`pnpm --dir infra exec cdk bootstrap aws://ACCOUNT_ID/ap-south-1`. Replace the account ID and region
as appropriate. Set `STEAMX_BUDGET_EMAIL` to an address that can receive budget alerts.

## Deploy and destroy

Run commands from the repository root. Install the isolated infra dependencies with
`pnpm infra:install`. Set `STEAMX_BUDGET_EMAIL` before synth, diff, deploy, or destroy. Optionally
set `STEAMX_CORS_ORIGINS` to a comma-separated list of browser origins and `AWS_REGION` (or CDK
context `region`) to override `ap-south-1`.

- `pnpm infra:synth` synthesizes the staging stack.
- `pnpm infra:diff` previews changes.
- `pnpm infra:deploy` deploys with approval required for permission broadening.
- `pnpm infra:destroy` destroys only `SteamxStagingStack`; staging bucket data is deleted.
- `pnpm infra:test` runs the CDK assertions separately from backend tests.

The environment is selected using CDK context `env` and defaults to `staging`. Non-staging stacks
retain the bucket and enable termination protection.

## Cost, credentials, and handover

S3 is pay-per-use; an empty, idle bucket has negligible cost. The monthly budget emails an alert at
80% actual spend and at 100% forecasted spend. Destroying staging removes all bucket data.

The backend will need `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY` when S3 integration is added.

When handing the AWS account over, remove the temporary deployer user and its access keys after
confirming the replacement account administrators can deploy and operate the stack.

## Later work

RDS/ECS/ALB are deferred until a domain exists; without a domain there is no HTTPS endpoint, so
there is no reason to run ECS or RDS yet. CloudFront comes later for frontend distribution. The
stop/start scripts are placeholders while staging is S3-only. The `pending/` prefix lifecycle rule
will be added with Module 3.
