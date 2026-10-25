# Architecture

## Backend layers

| Layer      | Responsibility                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- |
| Controller | HTTP routes, validated DTOs, auth context → delegates to service → returns result.          |
| Service    | Business rules, permission checks, school scope. Calls other modules via exported services. |
| Repository | Prisma queries and transactions. No HTTP or business logic.                                 |

Response mappers convert database records → response DTOs. Shared helpers live in `src/common/`; feature rules stay in their modules.

## Module map

| Module                  | Responsibility                                                                    | Exports                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AppModule`             | Root composition: config, feature modules, global guards, exception filter.       | —                                                                                                         |
| `AuthModule`            | Login, passwords, sessions, permissions.                                          | `AuthGuard`, `AuthContextRepository`, `AuthService`, `PasswordService`, `PermissionGuard`, `TokenService` |
| `UsersModule`           | User CRUD, profiles, status, SteamX IDs.                                          | —                                                                                                         |
| `SchoolsModule`         | School management.                                                                | `SchoolsService`                                                                                          |
| `ClassSectionsModule`   | Class-section management.                                                         | `ClassSectionsService`                                                                                    |
| `CurriculumModule`      | Global course/module/lesson lifecycle, ordering, status transitions, outline.     | `CoursesService`, `CourseModulesService`, `LessonsService`, `CourseOutlineService`                        |
| `AssetsModule`          | Asset library API, file lifecycle, access URLs, and repositories.                 | —                                                                                                         |
| `AssetProcessingModule` | Per-type processing seam; current processors retain uploaded files.               | `AssetProcessorRegistry`                                                                                  |
| `CleanupScheduler`      | `AssetsModule` provider; runs stale-file, empty-asset, and storage-queue cleanup. | —                                                                                                         |
| `StorageModule`         | S3 boundary and queued-prefix cleanup.                                            | `StorageService`, `StorageCleanupQueueService`                                                            |
| `TenancyModule`         | Resolves a required active school for workflows.                                  | `ActiveSchoolService`                                                                                     |
| `PrismaModule`          | Configured Prisma client.                                                         | `PrismaService`                                                                                           |
| `HealthModule`          | Liveness + database readiness checks.                                             | —                                                                                                         |
| `LoggingModule`         | Pino request logging, request IDs, redaction.                                     | —                                                                                                         |
| Global `ConfigModule`   | Validated environment config.                                                     | Global Nest provider                                                                                      |

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
- **Asset processing:** `AssetProcessorRegistry` selects the processor by asset type. VIDEO currently serves its MP4 original as playback; HLS can replace that processor and report asynchronous work through `processing_job_id` without a schema change.
- **Cleanup worker:** `StorageCleanupQueueService` pages eligible prefix entries in `StorageModule`; `AssetCleanupService` removes stale non-READY files and unreferenced empty assets in `AssetsModule`; `CleanupScheduler` runs both sequentially on a self-rescheduling timer.
- **Logging:** Pino structured logs with request ID. Sensitive fields redacted.
- **API contract:** `/api/v1` prefix. Swagger at `/api/docs` (when enabled).

## Known limits (MVP)

- Video is MP4-only and served through signed MP4 URLs; HLS is not implemented.
- Uploads use one request per file and have configured size limits.
- URLs are S3 presigned URLs, not CloudFront URLs.
- Cleanup runs inside the API process. Failed queue entries are retried on every cleanup run.
- PPTX upload is unsupported; no block service exists yet, so asset-in-use deletion protection relies on the database foreign key.
