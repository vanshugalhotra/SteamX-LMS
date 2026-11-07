# Architecture

This page maps the request path and feature ownership in the NestJS API; use it to find where a
behavior belongs before changing it.

## Backend structure

| Layer      | Owns                                                             |
| ---------- | ---------------------------------------------------------------- |
| Controller | HTTP routes, DTO inputs, response status; delegates to services. |
| Service    | Business rules and coordination across feature boundaries.       |
| Repository | Prisma reads, writes, and transactions; no HTTP behavior.        |
| Mapper     | Converts selected records into response DTOs.                    |

Shared request and domain helpers are in `apps/backend/src/common/`. Feature-specific behavior
belongs in its module under `apps/backend/src/`.

## Feature map

| Feature                                 | Responsibility                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `auth`, `users`                         | Cookie sessions, permission checks, accounts, profiles, and passwords.           |
| `schools`, `class-sections`             | School records and school-owned class/section records.                           |
| `curriculum`                            | Global courses, modules, lessons, ordering, outlines, and lesson content.        |
| `subscriptions`                         | School/course access terms and shared course-access checks.                      |
| `deliveries`                            | School course groups, teacher assignments, enrollments, and lesson releases.     |
| `learning`                              | Student/teacher course views, progress, lesson content, and lesson asset access. |
| `assets`, `storage`                     | Asset/file state, S3 access, and queued object cleanup.                          |
| `health`, `logging`, `config`, `prisma` | Health routes, request logging, validated configuration, and database client.    |

`Assignment` and `Submission` tables exist in Prisma, but their feature APIs are not implemented.

## Main request path

1. Pino assigns a request ID and logs the request.
2. `OriginGuard` checks `Origin` on POST, PUT, PATCH, and DELETE requests.
3. `AuthGuard` validates the cookie and reloads the current account and school state.
4. `PermissionGuard` checks route policy; a protected route without explicit policy is denied.
5. The global validation pipe transforms DTOs and rejects unknown fields.
6. Controller → service → repository; the exception filter formats errors.

API routes use `/api/v1`; health routes are `/health/live` and `/health/ready`. Swagger is at
`/api/docs` when enabled. No rate limiter is configured.

## Core data flows

- **Authoring:** platform staff manage the global `Course → Module → Lesson` hierarchy. Lesson
  content is saved as a complete versioned block tree.
- **Delivery:** platform-managed subscriptions allow a school to use a course. School deliveries
  group that course; assigned teachers and enrolled students receive different learning views.
- **Learning:** students see released STUDENT lessons while enrolled. Assigned teachers can also
  read unreleased and TEACHER_ONLY lessons. Both use the authenticated school scope.
- **Assets:** the API creates upload metadata and a presigned S3 URL. The client uploads directly
  to S3 and calls completion. The current processors validate and pass files through; they do not
  transcode them. File removal queues storage cleanup.

## Where to look next

- [Access control](./access-control.md) for identity, permissions, and tenant filtering.
- [Database](./database.md) for schema constraints and migration commands.
- [Lesson content](./lesson-content.md) for the read/save contract.
- [Infrastructure](../operations/infrastructure.md) for the current S3-only CDK stack.
- [Proposed AWS design](./aws-architecture.md) for the not-yet-deployed target.
