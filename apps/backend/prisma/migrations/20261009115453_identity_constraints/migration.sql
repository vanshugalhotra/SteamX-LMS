-- schools
ALTER TABLE schools
  ADD CONSTRAINT schools_code_fmt CHECK (code = upper(code) AND code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
  ADD CONSTRAINT schools_name_nonempty CHECK (length(btrim(name)) > 0),
  ADD CONSTRAINT schools_city_nonempty CHECK (length(btrim(city)) > 0),
  ADD CONSTRAINT schools_contact_email_norm CHECK (contact_email IS NULL OR contact_email = lower(btrim(contact_email)));

-- users
ALTER TABLE users
  ADD CONSTRAINT users_school_scope CHECK ((user_type = 'PLATFORM_STAFF') = (school_id IS NULL)),
  ADD CONSTRAINT users_steamx_id_fmt CHECK (steamx_id = upper(btrim(steamx_id)) AND steamx_id ~ '^[A-Z0-9][A-Z0-9._-]{2,31}$'),
  ADD CONSTRAINT users_email_norm CHECK (email IS NULL OR email = lower(btrim(email))),
  ADD CONSTRAINT users_student_no_email CHECK (user_type <> 'STUDENT' OR email IS NULL),
  ADD CONSTRAINT users_name_nonempty CHECK (length(btrim(name)) > 0);

-- profiles
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_type CHECK (user_type = 'STUDENT');
ALTER TABLE teacher_profiles ADD CONSTRAINT teacher_profiles_type CHECK (user_type = 'SCHOOL_STAFF');

-- class_sections
ALTER TABLE class_sections
  ADD CONSTRAINT class_sections_names_ok CHECK (
    length(btrim(class_name)) > 0 AND length(btrim(section_name)) > 0
    AND class_name = btrim(class_name) AND section_name = btrim(section_name));
CREATE UNIQUE INDEX class_sections_school_names_uq
  ON class_sections (school_id, lower(class_name), lower(section_name));