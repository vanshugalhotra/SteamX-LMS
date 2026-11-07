# Glossary

This glossary defines the domain terms used in the LMS guides and API.

| Term               | Meaning                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Course             | A global curriculum record authored by platform staff.                                                                                |
| Module             | An ordered group of lessons within a course.                                                                                          |
| Lesson             | A curriculum item within a module; it has a status and an audience.                                                                   |
| Lesson audience    | `STUDENT` content may be released to learners; `TEACHER_ONLY` is visible to assigned teachers.                                        |
| Subscription       | A school/course date range that grants course access while active.                                                                    |
| Delivery           | A labeled group that connects a school, course, and academic year. It is not the student's access grant.                              |
| Teacher assignment | An active or ended stint linking a teacher to a delivery.                                                                             |
| Enrollment         | A student's membership in a delivery. An active enrollment grants the student delivery access when other checks pass.                 |
| Release            | A record that makes an eligible lesson available to students in one delivery.                                                         |
| Completion         | A student's record that a released lesson was completed. Un-releasing hides a completion from progress totals but does not delete it. |
| Asset              | Reusable media metadata. File uploads and processing state are stored separately.                                                     |
| READY file         | The asset file selected for access after upload completion and validation.                                                            |
| Platform staff     | A user with no school assignment who can perform platform-wide actions when authorized.                                               |
| School staff       | A school-bound user. The current school staff role is `teacher`.                                                                      |

For the implemented learning access rules, see [access control](./architecture/access-control.md).
