# Database checks for frontend forms

Keep frontend validation aligned with the database; the database remains authoritative.
Update this list when new CHECK constraints or expression indexes are added.

- School code: uppercase, 2–32 characters, matching `[A-Z0-9][A-Z0-9_-]{1,31}`.
- School name and city: must not be blank after trimming. Contact email, when provided, must be trimmed and lowercase.
- User `steamx_id`: uppercase, trimmed, 3–32 characters, matching `[A-Z0-9][A-Z0-9._-]{2,31}`.
- User name: must not be blank after trimming. Email, when provided, must be trimmed and lowercase; students must not have an email.
- User scope: platform staff have no school; school staff and students require a school.
- Profile type must match its table: student profiles use `STUDENT`, teacher profiles use `SCHOOL_STAFF`.
- Class and section names must be nonblank and have no surrounding whitespace. Their combination must be unique without regard to case within a school; the same names may be used at another school.
