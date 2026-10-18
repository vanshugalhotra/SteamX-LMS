# Database

The Prisma schema defines all tables listed below. The NestJS source currently implements the
identity, school, and class-section modules; curriculum, delivery, enrollment, and assignment tables
exist in the schema but do not yet have matching API modules.

## Tables by area

Each table is listed once. Some schema areas do not yet have an API module.

| Area           | Table                         | Purpose                                                        |
| -------------- | ----------------------------- | -------------------------------------------------------------- |
| School         | `schools`                     | School identity, contact details, and status.                  |
| Authorization  | `roles`                       | Role key and user type.                                        |
| Authorization  | `permissions`                 | Named capabilities.                                            |
| Authorization  | `role_permissions`            | Role-to-permission grants.                                     |
| Users          | `users`                       | Account identity, credentials, status, and school association. |
| Users          | `student_profiles`            | Student-only profile details and current class section.        |
| Users          | `teacher_profiles`            | Teacher-only profile details.                                  |
| Class sections | `class_sections`              | School-owned class and section names.                          |
| Curriculum     | `courses`                     | Central course records.                                        |
| Curriculum     | `modules`                     | Ordered modules within a course.                               |
| Curriculum     | `lessons`                     | Ordered lessons within a module.                               |
| Asset library  | `assets`                      | Central media asset metadata.                                  |
| Asset library  | `asset_files`                 | File upload and processing state for an asset.                 |
| Curriculum     | `lesson_blocks`               | Structured content blocks within lessons.                      |
| Subscriptions  | `subscriptions`               | School access period and delivery limit for a course.          |
| Delivery       | `deliveries`                  | Course delivery to a school's class section and academic year. |
| Delivery       | `delivery_teachers`           | Teacher assignment stints for a delivery.                      |
| Delivery       | `delivery_lesson_releases`    | Lessons released to students in a delivery.                    |
| Enrollment     | `delivery_enrollments`        | Student membership and status for a delivery.                  |
| Progress       | `lesson_completions`          | Student lesson completion state.                               |
| Assignments    | `assignment_templates`        | Reusable assignment blueprint.                                 |
| Assignments    | `assignments`                 | Assignment instance for a delivery.                            |
| Assignments    | `assignment_items`            | Questions or tasks within an assignment.                       |
| Assignments    | `assignment_item_options`     | Choices for single-choice items.                               |
| Assignments    | `assignment_rubric_criteria`  | Criteria used to score an assignment.                          |
| Submissions    | `submissions`                 | A student's submitted assignment and grading state.            |
| Submissions    | `submission_answers`          | Answers attached to a submission.                              |
| Submissions    | `submission_files`            | Files attached to a submission.                                |
| Submissions    | `submission_criterion_scores` | Criterion scores for a graded submission.                      |
| Storage        | `storage_cleanup_queue`       | Storage keys queued for cleanup.                               |

## Database-enforced rules

The following rules are present in the committed PostgreSQL migrations; application validation is
not a substitute for them:

- Foreign keys use `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`.
- School codes are uppercase and match `[A-Z0-9][A-Z0-9_-]{1,11}`. School names and cities cannot
  be blank after trimming; contact email must be trimmed and lowercase.
- A platform-staff user has no school; other user types must have a school. SteamX IDs must be
  uppercase, trimmed, and match `[A-Z0-9][A-Z0-9._-]{2,31}`. Names cannot be blank after trimming.
  Email must be trimmed and lowercase when present, and students cannot have email.
- Student and teacher profile rows must have the matching user type. Deferred constraint triggers
  require a student profile for every `STUDENT` account and a teacher profile for users whose role
  key is `teacher`; deleting a required profile is rejected at transaction end.
- Class and section names must be nonblank and have no surrounding whitespace. A unique expression
  index prevents case-insensitive duplicates within one school.
- Triggers make role keys, school codes, class-section school IDs, and user type/school IDs immutable.
- A SteamX ID change is blocked unless the transaction-local setting
  `steamx.allow_steamx_id_change` is `on`. The rename repository sets it only inside its update
  transaction.

Other uniqueness and relationship rules are defined by primary keys, unique indexes, and foreign
keys in the Prisma schema and initial migration. Do not assume rules described only in schema
comments have a database trigger unless an applied migration creates it.

## Migrations and reference data

Prisma schema changes are applied through migrations in `apps/backend/prisma/migrations/`. There is
no configured `prisma db seed` command. The `reference_data` migration creates the `admin`,
`teacher`, and `student` roles and the current permissions and role grants.

- For local schema work, create and apply a migration with
  `pnpm --filter @steamx/backend migrate:dev --name <name>`.
- Apply committed migrations in deployment environments with
  `pnpm --filter @steamx/backend migrate:deploy`.
- Check migration state with `pnpm --filter @steamx/backend migrate:status`.
- Do not edit an applied migration; add a new migration instead.
- After migrations, `pnpm --filter @steamx/backend admin:create` creates the first platform admin
  from `ADMIN_STEAMX_ID` and `ADMIN_PASSWORD`. This is an application command, not a database seed.

## Reset a development database

This drops data in the database selected by `DATABASE_URL`. Confirm that it points only to your
local development database before running:

```powershell
pnpm --filter @steamx/backend exec prisma migrate reset
```

Prisma asks for confirmation, drops and recreates the schema, then reapplies migrations. No Prisma
seed runs. Recreate the local admin with `pnpm --filter @steamx/backend admin:create`.

## Validation reference

The database remains authoritative for database checks. Migration checks and format limits are
listed above; frontend validation should stay aligned with them.
