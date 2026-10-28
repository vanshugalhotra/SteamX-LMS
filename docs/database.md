# Database

The Prisma schema defines all tables. API modules cover identity, schools, class sections, curriculum, and asset storage. Delivery, enrollment, and assignment tables exist in the schema but have no API modules yet.

## Tables

| Area           | Table                         | Purpose                                             |
| -------------- | ----------------------------- | --------------------------------------------------- |
| School         | `schools`                     | School identity, contact, status.                   |
| Auth           | `roles`                       | Role key + user type.                               |
| Auth           | `permissions`                 | Named capabilities.                                 |
| Auth           | `role_permissions`            | Role → permission grants.                           |
| Users          | `users`                       | Account identity, credentials, status, school.      |
| Users          | `student_profiles`            | Student-specific details + class section.           |
| Users          | `teacher_profiles`            | Teacher-specific details.                           |
| Class sections | `class_sections`              | School-owned class + section names.                 |
| Curriculum     | `courses`                     | Central course records.                             |
| Curriculum     | `modules`                     | Ordered modules within a course.                    |
| Curriculum     | `lessons`                     | Ordered lessons within a module.                    |
| Curriculum     | `lesson_blocks`               | Structured content blocks within lessons.           |
| Assets         | `assets`                      | Central media asset metadata.                       |
| Assets         | `asset_files`                 | File upload + processing state.                     |
| Subscriptions  | `subscriptions`               | School access period + delivery limit per course.   |
| Delivery       | `deliveries`                  | Course delivery to a class section + academic year. |
| Delivery       | `delivery_teachers`           | Teacher assignment stints.                          |
| Delivery       | `delivery_lesson_releases`    | Released lessons in a delivery.                     |
| Enrollment     | `delivery_enrollments`        | Student membership + status.                        |
| Progress       | `lesson_completions`          | Student lesson completion state.                    |
| Assignments    | `assignment_templates`        | Reusable assignment blueprint.                      |
| Assignments    | `assignments`                 | Assignment instance for a delivery.                 |
| Assignments    | `assignment_items`            | Questions/tasks within an assignment.               |
| Assignments    | `assignment_item_options`     | Choices for single-choice items.                    |
| Assignments    | `assignment_rubric_criteria`  | Scoring criteria.                                   |
| Submissions    | `submissions`                 | Student submission + grading state.                 |
| Submissions    | `submission_answers`          | Answers attached to a submission.                   |
| Submissions    | `submission_files`            | Files attached to a submission.                     |
| Submissions    | `submission_criterion_scores` | Per-criterion scores.                               |
| Storage        | `storage_cleanup_queue`       | Storage keys queued for deletion.                   |

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
