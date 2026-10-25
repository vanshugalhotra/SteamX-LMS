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
- **Asset processing:** `AssetProcessorRegistry` selects a per-type processor. IMAGE and PDF pass through; VIDEO uses its original as the playback key. HLS can replace the video processor without a schema change (`processing_job_id` is already in the model).
- **Cleanup:** `CleanupScheduler` runs queue drain, stale-file removal, and ghost-asset removal sequentially on a self-rescheduling timer. See "Asset and storage flows" below.
- **Logging:** Pino structured logs with request ID. Sensitive fields redacted.
- **API contract:** `/api/v1` prefix. Swagger at `/api/docs` (when enabled).

## Asset and storage flows

### File states

```
UPLOADING → UPLOADED → PROCESSING → READY
    ↓          ↓           ↓
  FAILED     FAILED      FAILED
```

IMAGE and PDF may skip PROCESSING at the DB level; the code always goes through it. READY and FAILED are terminal — no further updates allowed.

### Upload

1. `POST /assets` — server creates asset + UPLOADING file row, returns a presigned S3 PUT URL (valid for `UPLOAD_URL_TTL_SECONDS`, default 15 min).
2. Client PUTs the file to S3 using the signed URL. `If-None-Match: *` prevents overwrites; signed `Content-Type` and `Content-Length` prevent type/size mismatches.
3. `POST /assets/:id/files/:fileId/complete` — server HEADs the S3 object, checks size and content type against declared values, reads 16 bytes for file-signature verification, then transitions UPLOADING → UPLOADED → PROCESSING → READY.

Completion is idempotent: re-calling it for a non-UPLOADING file returns the current state.

### Replacement

`POST /assets/:id/files` replaces the file on an existing asset. The asset ID stays stable. Stale UPLOADING/FAILED files are deleted; in-flight UPLOADED/PROCESSING files block replacement. On success, one transaction deletes the old READY file (its S3 prefix is queued for cleanup by a DB trigger) and flips the new file to READY. If the new file cannot transition, the transaction rolls back and the old file keeps serving.

### Access

Author previews (`GET /assets/:id/access`) require `asset.read` + platform staff. The response is a signed S3 GET URL using `playbackKey` (if set) or `storageKey`, with per-type TTLs, `Cache-Control: no-store`, and `Content-Disposition: inline`. No HEAD check is made before signing. An asset ID alone grants no access.

### Cleanup

Three steps run in order by `CleanupScheduler` every `CLEANUP_INTERVAL_SECONDS` (default 5 min):

1. **Queue drain** — an `AFTER DELETE ON asset_files` trigger inserts each deleted file's S3 prefix into `storage_cleanup_queue`. The scheduler drains entries older than `UPLOAD_URL_TTL_SECONDS` + 5 min grace, deleting S3 objects under each prefix, then marking the entry done.
2. **Stale files** — non-READY files with `updatedAt` older than `ASSET_STALE_FILE_AFTER_HOURS` (default 24 h) are deleted (a re-check prevents deleting files that transitioned to READY between scan and delete).
3. **Ghost assets** — assets with no files and no block references are deleted.

All steps are idempotent. Multiple API instances can run cleanup without coordination. The scheduler uses `setTimeout().unref()` so it does not block process shutdown and cannot overlap with itself.

## Known limits (MVP)

- Video is MP4-only, served as signed MP4 URLs; no HLS.
- PPTX is in the DB enum but uploads are rejected.
- Uploads are single-PUT (no multipart); size limits are configurable per type.
- Access URLs are S3 presigned URLs, not CloudFront.
- Cleanup runs in-process. Failed queue entries retry every run with no backoff or cap.
- Completed queue entries are never pruned from `storage_cleanup_queue`.
- No block service yet; asset-in-use deletion relies on the database FK.
