# Database rules

| Table            | Rule                                                                                         | Why                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `roles`          | `key` is immutable.                                                                          | Role keys are stable identifiers used by authorization.               |
| `schools`        | `code` is immutable.                                                                         | School codes are stable tenant identifiers.                           |
| `class_sections` | `school_id` is immutable.                                                                    | A class section must remain in its original tenant.                   |
| `users`          | `user_type`, `school_id`, and `steamx_id` are immutable.                                     | Identity and tenant ownership must not change after account creation. |
| `users`          | Students require a student profile; users with role key `teacher` require a teacher profile. | Profile rows are required parts of those user identities.             |
| `student_profiles`, `teacher_profiles` | Deleting a profile is rejected while its user still requires that profile. | Required user profiles must not be removable independently of their users. |

In production, make the app DB role read-only on `roles`, `permissions`, and `role_permissions` instead of adding a permissions trigger.

## Beware

Do not rename the tables referenced by these triggers without updating their trigger definitions and function logic in the same database migration. The trigger functions refer to `roles`, `schools`, `class_sections`, `users`, `student_profiles`, and `teacher_profiles` by name.
