## Project setup

```bash
$ pnpm install
```

## Configuration

Copy `.env.example` to `.env` and set the values for your environment, including
the required `DATABASE_URL`. Environment variables are validated when the API
starts; any missing required or invalid value stops startup with a list of the
variables that need attention.

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```