CREATE OR REPLACE FUNCTION reject_column_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  column_name text;
  new_row jsonb;
  old_row jsonb;
BEGIN
  new_row := to_jsonb(NEW);
  old_row := to_jsonb(OLD);

  FOREACH column_name IN ARRAY TG_ARGV
  LOOP
    IF (new_row -> column_name) IS DISTINCT FROM (old_row -> column_name) THEN
      RAISE EXCEPTION '% is immutable', TG_TABLE_NAME || '.' || column_name
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roles_immutable_key
BEFORE UPDATE OF key ON roles
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('key');

CREATE TRIGGER trg_schools_immutable_code
BEFORE UPDATE OF code ON schools
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('code');

CREATE TRIGGER trg_class_sections_immutable_school_id
BEFORE UPDATE OF school_id ON class_sections
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('school_id');

CREATE TRIGGER trg_users_immutable_identity
BEFORE UPDATE OF user_type, school_id, steamx_id ON users
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('user_type', 'school_id', 'steamx_id');

CREATE OR REPLACE FUNCTION check_user_has_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_type users.user_type%TYPE;
  user_role_key text;
BEGIN
  SELECT u.user_type, r.key
  INTO current_type, user_role_key
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_type = 'STUDENT'
     AND NOT EXISTS (
       SELECT 1
       FROM student_profiles
       WHERE user_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'users.student_profile is required for student user %', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF user_role_key = 'teacher'
     AND NOT EXISTS (
       SELECT 1
       FROM teacher_profiles
       WHERE user_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'users.teacher_profile is required for teacher user %', NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_users_require_profile
AFTER INSERT OR UPDATE OF role_id, user_type ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_user_has_profile();