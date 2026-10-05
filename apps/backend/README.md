## Project setup

```bash
$ pnpm install
```

## Configuration

Copy `.env.example` to `.env` and set the values for your environment, including
the required `DATABASE_URL`. Environment variables are validated when the API
starts; any missing required or invalid value stops startup with a list of the
variables that need attention.

## Logging

The API uses structured Pino logging. Production and test environments write
JSON to stdout; development uses readable `pino-pretty` output. Set `LOG_LEVEL`
to control the minimum logged level; `silent` disables logging. Request logs
include the method, URL, status, response time, and request ID; paths beginning
with `/health` are excluded. Request and response bodies are not logged.

Inject `PinoLogger` in a service and set its context to identify the source:

```ts
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class EnrollmentService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(EnrollmentService.name);
  }

  enroll(courseId: string): void {
    this.logger.info({ courseId }, 'Enrollment created');
  }
}
```

## API conventions

API routes use the `/api/v1` prefix. When enabled, Swagger UI is available at
`/api/docs`.

`GET /health/live` is available at the root without the `/api/v1` prefix. It
returns `{ "status": "ok" }` while the process is running and does not check
external dependencies.

Errors use a consistent response shape:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cannot GET /api/v1/missing",
  "requestId": "a84f4a1f-746d-4e64-9841-c99d5d6ced31"
}
```

Validation errors use `VALIDATION_ERROR` and include field details.

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
