# Database

This page summarizes the PostgreSQL model and constraints; check the Prisma schema and migrations
before changing stored data or adding a workflow.

The Prisma schema defines the tables and migrations enforce PostgreSQL rules. Subscriptions,
deliveries, teacher assignments, enrollments, and lesson releases have API implementations. Use
this page to check persistence constraints before changing a workflow. Assignment and submission
tables are present in the schema, but their feature APIs are not implemented.

## Tables

| Area           | Table                      | Purpose                                               |
| -------------- | -------------------------- | ----------------------------------------------------- |
| School         | `schools`                  | School identity, contact, status.                     |
| Auth           | `roles`                    | Role key + user type.                                 |
| Auth           | `permissions`              | Named capabilities.                                   |
| Auth           | `role_permissions`         | Role → permission grants.                             |
| Users          | `users`                    | Account identity, credentials, status, school.        |
| Users          | `student_profiles`         | Student-specific details + class section.             |
| Users          | `teacher_profiles`         | Teacher-specific details.                             |
| Class sections | `class_sections`           | School-owned class + section names.                   |
| Curriculum     | `courses`                  | Central course records.                               |
| Curriculum     | `modules`                  | Ordered modules within a course.                      |
| Curriculum     | `lessons`                  | Ordered lessons within a module.                      |
| Curriculum     | `lesson_blocks`            | Structured content blocks within lessons.             |
| Assets         | `assets`                   | Central media asset metadata.                         |
| Assets         | `asset_files`              | File upload + processing state.                       |
| Subscriptions  | `subscriptions`            | School access period + delivery limit per course.     |
| Delivery       | `deliveries`               | Labeled course group within a school + academic year. |
| Delivery       | `delivery_teachers`        | Teacher assignment stints.                            |
| Delivery       | `delivery_lesson_releases` | Released lessons in a delivery.                       |
| Enrollment     | `delivery_enrollments`     | Student membership + status.                          |
| Progress       | `lesson_completions`       | Student lesson completion state.                      |
| Assignments    | `assignment_templates`     | Reusable assignment blueprint.                        |
| Assignments    | `assignments`              | Assignment instance for a delivery.                   |
| Assignments    | `assignment_items`         | Questions/tasks within an assignment.                 |
| Assignments    | `assignment_item_options`  | Choices for single-choice items.                      |
| Submissions    | `submissions`              | Student submission + grading state.                   |
| Submissions    | `submission_answers`       | Answers attached to a submission.                     |
| Submissions    | `submission_files`         | Files attached to a submission.                       |
| Storage        | `storage_cleanup_queue`    | Storage keys queued for deletion.                     |

## Database-enforced rules

All foreign keys use `ON DELETE RESTRICT` / `ON UPDATE RESTRICT`.

### Identity & users

- School codes: uppercase, `[A-Z0-9][A-Z0-9_-]{1,11}`. Names and cities must be nonblank after trim. Contact email: trimmed + lowercase.
- School codes are immutable after creation. School status is a separate field; the API does not cascade a status update to users.
- Platform staff: no `school_id`. Other types: must have a school.
- SteamX IDs: uppercase, trimmed, `[A-Z0-9][A-Z0-9._-]{2,31}`. Names: nonblank after trim.
- Email: trimmed + lowercase when present. Students cannot have email.
- Deferred triggers require matching profile rows (student profile for `STUDENT`, teacher profile for `teacher` role).
- Immutability triggers: role keys, school codes, class-section school IDs, user type + school ID.
- SteamX ID changes blocked unless `steamx.allow_steamx_id_change` is set in the transaction.
- Class/section names: nonblank, no surrounding whitespace. Case-insensitive unique per school. `section_name` defaults to `All`; each row represents a class/section pair.

### Subscription and delivery rules

- **SQL function:** `has_course_access(school_id, course_id, date)` checks inclusive subscription start/end dates; the service calls it for current access.
- **SQL function:** `business_today()` derives the business date in the database; its current timezone is hard-coded as `Asia/Kolkata`.
- **Service layer:** subscription-gated workflows check current access with `business_today()`; database triggers repeat checks for delivery, enrollment, and release writes.
- **SQL exclusion constraint:** subscription date ranges cannot overlap per school/course; it is deferred, so a conflict can surface when the transaction commits.
- **SQL triggers:** subscription school/course, delivery school/course/year, enrollment school/delivery/student, and release school/course/delivery/lesson identity are immutable. Delivery labels may be renamed.
- **SQL unique index:** delivery labels are unique case-insensitively within school/course/academic year.
- **SQL CHECK:** delivery labels are trimmed and 1..100 characters.
- **Service and SQL:** subscription grants/renewals and delivery activation require an ACTIVE course; the delivery trigger also enforces this for inserts and reactivation.
- **SQL trigger:** `max_deliveries` counts ACTIVE labeled groups for each school/course across years. The trigger locks the current subscription row while counting, serializing concurrent use of the cap.
- **SQL trigger:** enrollment insert/reactivation requires a same-school active student, an ACTIVE delivery, and current course access; current class section does not affect enrollment or access. Status/end-date consistency is also constrained.
- **SQL trigger:** a release requires an in-scope actor, ACTIVE delivery and module, an ACTIVE STUDENT-audience lesson, and current course access.
- **SQL triggers:** lesson completions require an ACTIVE enrollment, a release, an ACTIVE or ARCHIVED STUDENT lesson, and current course access; completions are insert-only, with deletes handled by `purge_student()` in the retention issue.
- **SQL partial unique index:** only one active teacher stint is allowed per delivery/teacher pair; removed stints remain as history.
- **Seeded permission keys:** `subscription.manage`, `delivery.manage`, `delivery.read`, `enrollment.manage`, and `release.manage`; the reference migration grants all to admin and grants `delivery.read`, `enrollment.manage`, and `release.manage` to teacher.
- **Service-derived state:** subscription `status`/expired state and `retainedUntil` are calculated from dates and are never stored as subscription columns.

`business_today()` currently uses the hard-coded `Asia/Kolkata` timezone. The migration comment says
it should match a `BUSINESS_TIMEZONE` default, but the backend does not define that setting.

For route-level behavior, see the [API testing guide](../testing/api-testing.md).

### Curriculum & assets

- **Curriculum hierarchy:** courses are global, with no school foreign key. Module `course_id` and lesson `course_id` are immutable. Lesson `module_id` can change only within the same course, enforced by the composite foreign key; the current API has no lesson-move route. Lesson audience defaults to `TEACHER_ONLY`.
- **Titles/positions:** course/module/lesson/asset titles must be nonblank. Module, lesson, and top-level block positions must be positive. Module positions are unique per course; lesson positions are unique per module. Gaps are allowed.
- **Reordering:** append and reorder operations lock the parent course or module. Reorder APIs accept the exact complete set of child IDs; positions are temporarily moved out of range before reassignment to satisfy immediate unique constraints.
- **Lesson content version:** `lessons.content_version` is an integer defaulting to `0`; CHECK `lessons_content_version_nonneg` enforces `content_version >= 0`.
- **Lesson blocks:** `content` must be a JSON object; asset IDs are required exactly for IMAGE, VIDEO, PDF, and PPTX rows. Top-level rows have a positive `position` and no parent/column index; child rows have a parent and a column index of `0` or `1`, with no position.
- **Block relationships:** the composite parent FK keeps a child in its lesson; a trigger requires a TWO_COLUMN parent and matching asset/block types. Children cannot themselves be TWO_COLUMN. Unique `(lesson_id, position)` and `(parent_block_id, column_index)` constraints prevent duplicate order/slots. The database permits an empty or partially filled layout; the API materializes two nullable slots and enforces the request shape.
- **Immutable fields:** module `course_id`, lesson `course_id`, asset `type`, lesson-block `lesson_id` and `type`.
- **Ordering:** Unique constraints prevent duplicate positions. Use temporary positions when reordering; delete + recreate two-column children rather than swapping.
- **Status transitions:**
  - Courses, modules, and lessons may move from DRAFT to ACTIVE or ARCHIVED; ACTIVE and ARCHIVED may transition between each other, but no status returns to DRAFT.
  - Modules require active courses; lessons require active modules.
  - Archiving a parent archives active descendants only (not drafts) and does not change existing deliveries.
  - Draft content is never student-visible. Released active/archived content stays available until subscription expiry.
- **Asset files:** IDs are UUIDv7. Storage keys must start with `assets/<asset_id>/<asset_file_id>/`. Only one READY file per asset. READY/FAILED rows reject updates. VIDEO READY files require a playback key. The database permits `UPLOADED → READY` for IMAGE/PDF and requires `PROCESSING` for VIDEO/PPTX; the current completion service routes supported types through `PROCESSING`. PPTX remains in the enum but uploads are rejected.
- **Cleanup queue:** Deleting an asset file queues its prefix; deleting a submission file queues its object key. The current worker handles prefixes only. Pending jobs have partial indexes.

### Assignments & submissions

- Templates are platform-staff authored. Assignments start as DRAFT and may publish only with an active delivery, course access, due date, items, and valid item/rubric combinations.
- First publish sets `published_at`; assignments cannot return to DRAFT. Once a submission exists, only title, description, due date, resubmission setting, and status remain editable.
- Submissions are created only for published assignments and active enrollments with current course access. Resubmission is transactional and clears grading; answers/files are writable only during submit/resubmit or purge.
- Grading state, answer shape/correctness, file ownership/type/key, and item/option freeze rules are database-enforced. `is_late` is derived in the query/mapper; uploads stage under a school-scoped pending key and receive their final key at submit.

## Migrations

Migrations live in `apps/backend/prisma/migrations/`. No `prisma db seed` is configured. The `reference_data` migration creates roles, permissions, and grants.

```powershell
# Create + apply a migration (local dev)
pnpm --filter @steamx/backend migrate:dev --name <name>

# Apply in deployment
pnpm --filter @steamx/backend migrate:deploy

# Check state
pnpm --filter @steamx/backend migrate:status
```

> **Rules:** Never edit an applied migration. Never use `synchronize: true` outside local dev.

After migrations, create the first admin:

```powershell
pnpm --filter @steamx/backend admin:create
```

(Reads `ADMIN_STEAMX_ID` and `ADMIN_PASSWORD` from env.)

## Reset a dev database

```powershell
pnpm --filter @steamx/backend exec prisma migrate reset
```

Drops everything, reapplies migrations. No seed runs — recreate admin with `admin:create`.
