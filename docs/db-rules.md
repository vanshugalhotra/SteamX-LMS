# Database rules

| Table            | Rule                                                                                         | Why                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `roles`          | `key` is immutable.                                                                          | Role keys are stable identifiers used by authorization.               |
| `schools`        | `code` is immutable.                                                                         | School codes are stable tenant identifiers.                           |
| `class_sections` | `school_id` is immutable.                                                                    | A class section must remain in its original tenant.                   |
| `users`          | `user_type`, `school_id`, and `steamx_id` are immutable.                                     | Identity and tenant ownership must not change after account creation. |
| `users`          | Students require a student profile; users with role key `teacher` require a teacher profile. | Profile rows are required parts of those user identities.             |

In production, make the app DB role read-only on `roles`, `permissions`, and `role_permissions` instead of adding a permissions trigger.
