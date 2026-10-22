# Architecture

## Backend layers

| Layer      | Responsibility                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- |
| Controller | HTTP routes, validated DTOs, auth context → delegates to service → returns result.          |
| Service    | Business rules, permission checks, school scope. Calls other modules via exported services. |
| Repository | Prisma queries and transactions. No HTTP or business logic.                                 |

Response mappers convert database records → response DTOs. Shared helpers live in `src/common/`; feature rules stay in their modules.

## Module map

| Module                | Responsibility                                                                | Exports                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AppModule`           | Root composition: config, feature modules, global guards, exception filter.   | —                                                                                                         |
| `AuthModule`          | Login, passwords, sessions, permissions.                                      | `AuthGuard`, `AuthContextRepository`, `AuthService`, `PasswordService`, `PermissionGuard`, `TokenService` |
| `UsersModule`         | User CRUD, profiles, status, SteamX IDs.                                      | —                                                                                                         |
| `SchoolsModule`       | School management.                                                            | `SchoolsService`                                                                                          |
| `ClassSectionsModule` | Class-section management.                                                     | `ClassSectionsService`                                                                                    |
| `CurriculumModule`    | Global course/module/lesson lifecycle, ordering, status transitions, outline. | `CoursesService`, `CourseModulesService`, `LessonsService`, `CourseOutlineService`                        |
| `StorageModule`       | S3 boundary: presigned URLs, object metadata, prefix deletion.                | `StorageService`                                                                                          |
| `TenancyModule`       | Resolves a required active school for workflows.                              | `ActiveSchoolService`                                                                                     |
| `PrismaModule`        | Configured Prisma client.                                                     | `PrismaService`                                                                                           |
| `HealthModule`        | Liveness + database readiness checks.                                         | —                                                                                                         |
| `LoggingModule`       | Pino request logging, request IDs, redaction.                                 | —                                                                                                         |
| Global `ConfigModule` | Validated environment config.                                                 | Global Nest provider                                                                                      |

> **Note:** Delivery, enrollment, and assignment tables exist in the schema but have no API modules yet.

## Request lifecycle

1. **Logging** — Pino assigns/accepts a UUID request ID, returns `X-Request-Id`.
2. **Rate limiting** — not configured yet.
3. **OriginGuard** — checks `Origin` on state-changing requests against `CORS_ORIGINS`.
4. **AuthGuard** — allows public routes or validates cookie + account state.
5. **PermissionGuard** — checks declared permission; denies routes without explicit policy.
6. **ValidationPipe** — transforms DTOs, rejects unknown/invalid fields.
7. **Controller → Service → Repository** — business rules, then Prisma queries.
8. **Response mapping** — mapper converts DB records to response DTOs.
9. **Exception filter** — maps errors to `{ statusCode, code, message, requestId }`.

## Conventions

- **Error format:** `{ statusCode, code, message, requestId }`, with optional `details` for field-level errors. Server errors use a safe message.
- **Pagination:** `{ items, page, limit, total }`. Defaults: page 1, limit 20, max 100.
- **DTOs:** class-validator input DTOs via global pipe. Response DTOs via explicit mappers (never raw Prisma entities).
- **Config:** Zod validates env vars at startup. Services use typed Nest config.
- **Logging:** Pino structured logs with request ID. Sensitive fields redacted.
- **API contract:** `/api/v1` prefix. Swagger at `/api/docs` (when enabled).
