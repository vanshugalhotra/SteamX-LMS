# Backend setup

Use the [repository README](../../README.md) for shared setup, run, and test instructions.
Backend configuration variables are listed in [`.env.example`](./.env.example).

The backend's controllers, services, repositories, and module exports are described in
[Architecture](../../docs/architecture/architecture.md); database migrations and reset instructions are in
[Database](../../docs/architecture/database.md).

## Container image

From the repository root, build and run the API:

```sh
docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=<sha> -t steamx-api .
docker buildx build --platform linux/arm64 -f apps/backend/Dockerfile --build-arg GIT_SHA=<sha> -t steamx-api --load .
docker run --rm --env-file apps/backend/.env -p 3333:3333 steamx-api
```

The runtime image includes the Amazon RDS global CA bundle at
`/app/certs/rds-global-bundle.pem`; `NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE` point to it so
Node.js and Prisma can validate TLS connections to RDS. These settings provide trusted certificates
but do not force TLS, so a local non-TLS PostgreSQL connection continues to work.

Run migrations with the same runtime environment, and create the first admin once during initial provisioning:

```sh
docker run --rm --env-file apps/backend/.env steamx-api ./node_modules/.bin/prisma migrate deploy
docker run --rm --env-file apps/backend/.env steamx-api node dist/scripts/admin-create.js
```

Set the environment variable names listed in `.env.example` in the runtime environment or env file; pass secrets at runtime and never bake them into the image.
