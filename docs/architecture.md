# Architecture

This page maps the backend's modules and request path. Use it to find the owner of an API behavior.

## Backend layers

| Layer      | Responsibility                                                                      |
| ---------- | ----------------------------------------------------------------------------------- |
| Controller | HTTP routes, validated DTOs, and response status; delegates to services.            |
| Service    | Business rules, school scope, and calls to other modules through exported services. |
| Repository | Prisma queries and transactions; no HTTP behavior.                                  |

Mappers convert selected database records to response DTOs. Shared request and domain helpers live
in `apps/backend/src/common/`; feature rules stay in their feature modules.

## Module map

| Module                                          | Responsibility                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AppModule`                                     | Composes config, feature modules, global guards, and the exception filter.                        |
| `AuthModule`                                    | Login, password changes, session tokens, and permission checks. Exports auth services and guards. |
| `UsersModule`                                   | User accounts, profiles, status, password resets, and SteamX IDs.                                 |
| `SchoolsModule`                                 | School identity, contact details, status, and school-scope reads. Exports `SchoolsService`.       |
| `ClassSectionsModule`                           | School-owned class/section records and scoped CRUD. Exports `ClassSectionsService`.               |
| `TenancyModule`                                 | Resolves active schools for scoped workflows.                                                     |
| `CurriculumModule`                              | Global course/module/lesson lifecycle, ordering, and lesson content.                              |
| `AssetsModule`                                  | Asset/file lifecycle, validation, processing, and author preview.                                 |
| `StorageModule`                                 | S3 storage contract, presigned URLs, and queued object cleanup.                                  |
| `PrismaModule`                                  | Configured Prisma client.                                                                         |
| `HealthModule`, `LoggingModule`, `ConfigModule` | Liveness/readiness, request logging, and validated environment configuration.                     |

Delivery, enrollment, and assignment tables exist in Prisma but do not have API modules yet.

## Authentication and user data flow

1. Login goes from `AuthController` to `AuthService`, which uses `AuthContextRepository` and
   `PasswordService`; `TokenService` signs the cookie token.
2. Protected requests load the current user, role, and school from PostgreSQL in `AuthGuard`.
   `PermissionGuard` checks the route's declared policy against grants cached at startup.
3. User routes go from `UsersController` to `UsersService`. It combines school scope and user
   visibility before reading or mutating records, and calls school/class-section services when
   needed.
4. `UsersRepository` handles persistence; account and profile creation/updates that must stay
   together run in a transaction. `users.mapper.ts` returns public DTOs.

User-record visibility is separate from school scope: platform staff can see all users, while
school staff and students currently see only their own record. See [access control](./access-control.md).

## Schools and class sections

- `SchoolsController` → `SchoolsService` → `SchoolsRepository` handles school CRUD. School creation
  is platform-staff-only even when another actor has `school.manage`; school reads and updates use
  resolved scope.
- `ClassSectionsController` → `ClassSectionsService` → `ClassSectionsRepository` handles
  school-owned class/section rows. Creation resolves an active school; list, detail, update, and
  delete queries include school scope. The service maps duplicate names and referenced deletes to
  domain conflicts.
- Class names and section names are stored on each row. A missing section name uses the database
  default `All`; case-insensitive name pairs are unique within a school. A row is how the schema
  represents a class and one of its sections.
- School status is checked by authentication for school users and by `ActiveSchoolService` in
  workflows that require an active school. See [database constraints](./database.md#identity--users),
  [access control](./access-control.md), and the [API test checklist](./api-testing.md).

## HTTP request path

1. Pino assigns a request ID and logs the request.
2. `OriginGuard` checks `Origin` on state-changing requests.
3. `AuthGuard` allows public routes or validates the session and current account state.
4. `PermissionGuard` checks route policy; a protected route without explicit policy is denied.
5. The global validation pipe transforms DTOs and rejects unknown or invalid fields.
6. Controller → service → repository; response mappers shape the result. The exception filter
   returns the standard error envelope.

Rate limiting is not configured. The API prefix is `/api/v1`; Swagger is at `/api/docs` when enabled.

## Asset upload and storage

1. `AssetsService` validates declared type, MIME, and size; `AssetsRepository` creates the asset and
   an `UPLOADING` file row in one transaction.
2. `StorageService` returns a presigned S3 PUT URL. The client uploads directly to S3, then calls
   the completion route.
3. Completion checks S3 size/type and the first 16 bytes, runs the registered processor, and
   transactionally makes the file `READY`. Current processors do not transform files.
4. Deleting file rows queues their S3 prefixes through a PostgreSQL trigger. The in-process cleanup
   scheduler drains the queue and removes stale non-READY files; details and limits are in
   [infrastructure](./infrastructure.md).

## Related guides

- [Database schema and constraints](./database.md)
- [Access control](./access-control.md)
- [Infrastructure and storage operations](./infrastructure.md)
- [Lesson content contract](./lesson-content.md)
