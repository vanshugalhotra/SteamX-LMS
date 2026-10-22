# Database

The Prisma schema defines all tables. API modules currently cover identity, schools, class sections, and curriculum. Other tables (delivery, enrollment, assignments) exist in the schema but have no API yet.

## Tables

| Area | Table | Purpose |
| --- | --- | --- |
| School | `schools` | School identity, contact, status. |
| Auth | `roles` | Role key + user type. |
| Auth | `permissions` | Named capabilities. |
| Auth | `role_permissions` | Role → permission grants. |
| Users | `users` | Account identity, credentials, status, school. |
| Users | `student_profiles` | Student-specific details + class section. |
| Users | `teacher_profiles` | Teacher-specific details. |
| Class sections | `class_sections` | School-owned class + section names. |
| Curriculum | `courses` | Central course records. |
| Curriculum | `modules` | Ordered modules within a course. |
| Curriculum | `lessons` | Ordered lessons within a module. |
| Curriculum | `lesson_blocks` | Structured content blocks within lessons. |
| Assets | `assets` | Central media asset metadata. |
| Assets | `asset_files` | File upload + processing state. |
| Subscriptions | `subscriptions` | School access period + delivery limit per course. |
| Delivery | `deliveries` | Course delivery to a class section + academic year. |
| Delivery | `delivery_teachers` | Teacher assignment stints. |
| Delivery | `delivery_lesson_releases` | Released lessons in a delivery. |
| Enrollment | `delivery_enrollments` | Student membership + status. |
| Progress | `lesson_completions` | Student lesson completion state. |
| Assignments | `assignment_templates` | Reusable assignment blueprint. |
| Assignments | `assignments` | Assignment instance for a delivery. |
| Assignments | `assignment_items` | Questions/tasks within an assignment. |
| Assignments | `assignment_item_options` | Choices for single-choice items. |
| Assignments | `assignment_rubric_criteria` | Scoring criteria. |
| Submissions | `submissions` | Student submission + grading state. |
| Submissions | `submission_answers` | Answers attached to a submission. |
| Submissions | `submission_files` | Files attached to a submission. |
| Submissions | `submission_criterion_scores` | Per-criterion scores. |
| Storage | `storage_cleanup_queue` | Storage keys queued for deletion. |

## Database-enforced rules

All foreign keys use `ON DELETE RESTRICT` / `ON UPDATE RESTRICT`.

### Identity & users

- School codes: uppercase, `[A-Z0-9][A-Z0-9_-]{1,11}`. Names and cities must be nonblank after trim. Contact email: trimmed + lowercase.
- Platform staff: no `school_id`. Other types: must have a school.
- SteamX IDs: uppercase, trimmed, `[A-Z0-9][A-Z0-9._-]{2,31}`. Names: nonblank after trim.
- Email: trimmed + lowercase when present. Students cannot have email.
- Deferred triggers require matching profile rows (student profile for `STUDENT`, teacher profile for `teacher` role).
- Immutability triggers: role keys, school codes, class-section school IDs, user type + school ID.
- SteamX ID changes blocked unless `steamx.allow_steamx_id_change` is set in the transaction.
- Class/section names: nonblank, no surrounding whitespace. Case-insensitive unique per school.

### Curriculum & assets

- **Titles/positions:** course/module/lesson/asset titles must be nonblank. Module, lesson, and top-level block positions must be positive.
- **Blocks:** content must be JSON object. DB checks enforce asset/block shape, two-column layout, column range, valid parent + asset types.
- **Immutable fields:** module `course_id`, lesson `course_id`, asset `type`, lesson-block `lesson_id` and `type`.
- **Ordering:** Unique constraints prevent duplicate positions. Use temporary positions when reordering; delete + recreate two-column children rather than swapping.
- **Status transitions:**
  - Modules require active courses; lessons require active modules.
  - Archiving a parent archives active descendants only (not drafts). Does not affect existing deliveries.
  - Status cannot return to DRAFT.
  - Draft content is never student-visible. Released active/archived content stays available until subscription expiry.
- **Asset files:** IDs are UUIDv7. Storage keys must start with `assets/<asset_id>/<asset_file_id>/`. Only one READY file per asset. READY/FAILED rows reject updates. VIDEO READY files require a playback key. Lifecycle: UPLOADING → UPLOADED → (PROCESSING for VIDEO/PPTX) → READY or FAILED.
- **Cleanup queue:** Deleting a file queues its prefix. Workers delete objects before marking done. Pending jobs have partial indexes.

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
