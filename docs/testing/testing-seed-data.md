# Testing seed data

Use this seed for manual Postman/UI checks against a **fresh development database**. From the
repository root, reset and seed it with:

```powershell
pnpm --filter @steamx/backend exec prisma migrate reset
pnpm db:test:seed
```

Confirm `apps/backend/.env` has the development `DATABASE_URL` before resetting. The seed does not
wipe or upsert data; it refuses `NODE_ENV=production`, database names containing a `test` segment,
and databases that already contain application records. It creates database rows only; it does not
upload objects to S3.

All accounts use the password **`testing-password`**. The seed prints this login table on success.

| SteamX ID           | Role    | School   | Status   |
| ------------------- | ------- | -------- | -------- |
| `STEAMX-ADMIN`      | admin   | Platform | ACTIVE   |
| `NORTH-AVAR000`     | teacher | NORTH    | ACTIVE   |
| `NORTH-THEOM000`    | teacher | NORTH    | ACTIVE   |
| `NORTH-NOORP000`    | teacher | NORTH    | INACTIVE |
| `SOUTH-LIAMC000`    | teacher | SOUTH    | ACTIVE   |
| `SOUTH-MAYAO000`    | teacher | SOUTH    | ACTIVE   |
| `SOUTH-OWENB000`    | teacher | SOUTH    | INACTIVE |
| `NORTH-ALEXM000`    | student | NORTH    | ACTIVE   |
| `NORTH-RILEYB000`   | student | NORTH    | ACTIVE   |
| `NORTH-JORDANE000`  | student | NORTH    | INACTIVE |
| `NORTH-CASEYT000`   | student | NORTH    | ACTIVE   |
| `NORTH-DREWF000`    | student | NORTH    | ACTIVE   |
| `NORTH-PARKERL000`  | student | NORTH    | ACTIVE   |
| `SOUTH-TAYLORR000`  | student | SOUTH    | ACTIVE   |
| `SOUTH-MORGANL000`  | student | SOUTH    | INACTIVE |
| `SOUTH-CAMERONP000` | student | SOUTH    | ACTIVE   |
| `SOUTH-SKYLERD000`  | student | SOUTH    | ACTIVE   |
| `SOUTH-HAYDENS000`  | student | SOUTH    | ACTIVE   |
| `SOUTH-EMERYS000`   | student | SOUTH    | ACTIVE   |

| Record                                                                                                   | Scenario it exists to test                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Northstar Learning School (`NORTH`) and Southridge Academy (`SOUTH`)                                     | School listing, school scope, cross-school 404 behavior                              |
| Three class sections per school, including `Grade 5 / Blue` in both                                      | Section filters, duplicate names across schools, foreign-section access              |
| Active and inactive teachers/students in both schools                                                    | Login/status handling, user filters, two-school isolation                            |
| `Foundations of Robotics` (ACTIVE), `Draft Course Example` (DRAFT), `Archived Course Example` (ARCHIVED) | Course filters, status handling, course outline                                      |
| Active, draft, and archived modules and lessons under `Foundations of Robotics`                          | Outline ordering, status/audience filters, empty and populated lesson content        |
| `Build a Line-Following Robot` (content version 7)                                                       | Rich text, accordion, image, video, PDF, two-column blocks, repeated asset reference |
| `Robot Arm Diagram` and `Replacement Sample`                                                             | READY image file; READY file remains selected beside a FAILED replacement            |
| `Robotics Build Guide` and `Line-Following Robot Demo`                                                   | READY PDF and VIDEO; video has its required playback key                             |
| `Failed Upload Sample`, `Processing Queue Sample`, `Uploaded, Not Ready Sample`                          | FAILED, UPLOADING, and UPLOADED file filters and access errors                       |
| `Asset Without a File`                                                                                   | Null file summaries and not-ready access response                                    |
| NORTH / `Foundations of Robotics` subscription ending today; SOUTH / same course active                  | Active/ending-today subscription filters and cross-school course access              |
| NORTH / `Expired Subscription Lab`                                                                       | Expired subscription plus an existing delivery retained after expiry                 |
| NORTH / `Advanced Robotics`                                                                              | Upcoming subscription and denied current access                                      |
| SOUTH / `Robot Math and Measurement` older and current terms                                             | Adjacent, non-overlapping renewal ranges                                             |
| NORTH / `Robotics Design Studio` and its one ACTIVE delivery                                             | Subscription cap reached and delivery-limit behavior                                 |
| NORTH / `Foundations of Robotics` active and inactive deliveries; SOUTH active delivery                  | Delivery status, school isolation, and empty teacher-assignment list                 |
| NORTH / `Foundations of Robotics` has four active deliveries across Grade 5 Blue/Green and Grade 6       | Multiple academic years and subscription delivery cap                                |
| Ava has an active assignment; Theo has only an ended assignment on the NORTH active delivery             | Assigned, unassigned, and ended-assignment teacher access                            |
| Alex and Riley have active enrollments in NORTH; Taylor is enrolled in SOUTH                             | Own-school course listing, enrollment visibility, and school isolation               |
| Drew has a COMPLETED enrollment; Casey has a REMOVED enrollment                                          | Inactive enrollment exclusion from student course lists and access                   |
| Casey is enrolled in the NORTH expired-subscription delivery                                             | Course remains listed with `subscriptionActive: false`; outline access is forbidden  |
| NORTH active delivery releases three STUDENT lessons; one is archived after release                      | Active/archived lesson visibility, student outline, and lesson counts                |
| NORTH active delivery has completions for Alex on one ACTIVE and one ARCHIVED lesson                     | Completion flags and grouped progress counts                                         |
| NORTH 2025-26 Grade 5 Blue delivery has an active enrollment but no releases                             | A valid empty outline and zero lesson counts                                         |
| Active STUDENT lesson in `No Released Lessons` module is not released                                    | Modules without released lessons are hidden from the outline                         |
| `Teacher Robotics Lab Notes` is TEACHER_ONLY; draft and unreleased lessons also exist                    | Audience, draft, and release filtering for learning reads                            |
| `Build a Line-Following Robot` released in NORTH and SOUTH active deliveries                             | Release state across schools and deliveries                                          |

Assignment and submission records are not seeded. Enrollment, release, and completion rows are
created while their school/course subscriptions are active, then the expired-subscription scenario
is moved into the past. This keeps the seed compatible with the database guards while preserving
the expired-subscription read case. Subscription dates come from PostgreSQL `business_today()`.
