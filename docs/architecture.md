# Architecture

## Backend layers

| Layer      | Responsibility                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Controller | Defines HTTP routes, reads validated DTOs and the authenticated caller, delegates to a service, and returns the result.     |
| Service    | Applies business rules, permissions-related orchestration, school scope, and calls other modules through exported services. |
| Repository | Runs Prisma reads and writes. It owns query construction and database transactions, not HTTP or business policy.            |

Response mappers convert selected database records to response DTOs. They keep database-only fields
out of API responses. Shared helpers live under `src/common/`; feature rules stay in their modules.

## Module map

| Module                | Responsibility                                                                      | Exports                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AppModule`           | Composes configuration, feature modules, global guards, and the exception filter.   | None                                                                                                      |
| `AuthModule`          | Login, password changes, session validation, and permission checks.                 | `AuthGuard`, `AuthContextRepository`, `AuthService`, `PasswordService`, `PermissionGuard`, `TokenService` |
| `UsersModule`         | User creation, lookup, profile changes, status, passwords, and SteamX IDs.          | None                                                                                                      |
| `SchoolsModule`       | School management.                                                                  | `SchoolsService`                                                                                          |
| `ClassSectionsModule` | Class-section management.                                                           | `ClassSectionsService`                                                                                    |
| `CurriculumModule`    | Global course, module, and lesson lifecycle, ordered lists, and status transitions. | `CoursesService`, `CourseModulesService`, `LessonsService`                                                |
| `TenancyModule`       | Resolves a required active school for workflows that need one.                      | `ActiveSchoolService`                                                                                     |
| `PrismaModule`        | Provides the configured Prisma client.                                              | `PrismaService`                                                                                           |
| `HealthModule`        | Liveness and database-readiness checks.                                             | None                                                                                                      |
| `LoggingModule`       | Configures Pino request logging, request IDs, and redaction.                        | None                                                                                                      |
| Global `ConfigModule` | Validates and provides typed environment configuration.                             | Global Nest provider                                                                                      |

The backend source currently has no delivery, enrollment, or assignment API modules; their schema
tables are described in [Database](./database.md).

## Request lifecycle

1. Pino assigns or accepts a UUID request ID, returns it in `X-Request-Id`, and logs the request.
   Cookie parsing, security headers, and CORS are also configured before route handling.
2. Rate limiting: no rate-limit middleware or guard is currently configured, so no limit check runs.
3. `OriginGuard` checks the Origin of state-changing requests against `CORS_ORIGINS`.
4. `AuthGuard` allows public routes or validates the cookie and current account state.
5. `PermissionGuard` allows public routes, checks the declared permission, allows explicitly
   authenticated-only routes, and rejects routes without an explicit policy.
6. Nest's global `ValidationPipe` transforms DTOs and rejects unknown properties and invalid input.
7. The controller delegates to the service; the service applies rules and calls repositories or
   exported services.
8. A repository builds Prisma queries and returns selected records. The service maps those records
   to response DTOs before the controller returns them.
9. The global exception filter maps thrown HTTP and database errors to the API error format and
   logs unexpected server errors.

## Shared conventions

- **Errors:** the exception filter returns `statusCode`, `code`, `message`, and `requestId`, with
  `details` when a client error has field-level information. Server errors use a safe message.
- **Pagination:** list results use `items`, `page`, `limit`, and `total`. The current defaults are
  page 1 and limit 20, with a maximum limit of 100.
- **Input and output DTOs:** class-validator DTOs validate input through the global pipe.
  Controllers return response DTOs produced by explicit mappers, not Prisma entities.
- **Configuration:** Zod validates backend environment variables at startup; services use typed
  Nest configuration. Prisma CLI configuration reads `DATABASE_URL` from the environment.
- **Logging:** Pino uses structured logs and a request ID. Sensitive request fields are redacted.
- **API contract:** URI versioning defaults to `/api/v1`; Swagger is the source for route details
  and is served at `/api/docs` when enabled.
