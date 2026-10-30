CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION business_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

COMMENT ON FUNCTION business_today() IS
  'Must match the BUSINESS_TIMEZONE environment default.';

CREATE OR REPLACE FUNCTION has_course_access(
  p_school_id uuid,
  p_course_id uuid,
  p_at_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions s
    WHERE s.school_id = p_school_id
      AND s.course_id = p_course_id
      AND s.start_date <= p_at_date
      AND p_at_date <= s.end_date
  );
$$;

CREATE OR REPLACE FUNCTION actor_in_scope(p_actor_id uuid, p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_actor_id
      AND (u.user_type = 'PLATFORM_STAFF' OR u.school_id = p_school_id)
  );
$$;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_end_date_order
    CHECK (end_date >= start_date),
  ADD CONSTRAINT subscriptions_max_deliveries_positive
    CHECK (max_deliveries > 0),
  ADD CONSTRAINT subscriptions_school_course_no_overlap
    EXCLUDE USING gist (
      school_id WITH =,
      course_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    )
    DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER trg_subscriptions_immutable_identity
BEFORE UPDATE OF school_id, course_id ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('school_id', 'course_id');

CREATE FUNCTION guard_subscription_max_deliveries()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_delivery_count bigint;
BEGIN
  PERFORM 1
  FROM subscriptions
  WHERE id = NEW.id
  FOR UPDATE;

  SELECT count(*)
  INTO active_delivery_count
  FROM deliveries
  WHERE school_id = NEW.school_id
    AND course_id = NEW.course_id
    AND status = 'ACTIVE';

  IF NEW.max_deliveries < active_delivery_count THEN
    RAISE EXCEPTION 'subscriptions.max_deliveries cannot be below the active delivery count'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscriptions_guard_max_deliveries
BEFORE UPDATE OF max_deliveries ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION guard_subscription_max_deliveries();

ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_academic_year_fmt
    CHECK (academic_year ~ '^[0-9]{4}-[0-9]{2}$');

CREATE TRIGGER trg_deliveries_immutable_identity
BEFORE UPDATE OF school_id, course_id, class_section_id, academic_year ON deliveries
FOR EACH ROW
EXECUTE FUNCTION reject_column_change(
  'school_id',
  'course_id',
  'class_section_id',
  'academic_year'
);

CREATE FUNCTION guard_delivery_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  course_status text;
  subscription_id uuid;
  delivery_limit integer;
  active_delivery_count bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status = 'INACTIVE' AND NEW.status = 'ACTIVE') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT c.status::text
  INTO course_status
  FROM courses c
  WHERE c.id = NEW.course_id
  FOR SHARE;

  IF course_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'deliveries require an ACTIVE course'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  SELECT s.id, s.max_deliveries
  INTO subscription_id, delivery_limit
  FROM subscriptions s
  WHERE s.school_id = NEW.school_id
    AND s.course_id = NEW.course_id
    AND s.start_date <= business_today()
    AND business_today() <= s.end_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deliveries require a current subscription'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  SELECT count(*)
  INTO active_delivery_count
  FROM deliveries d
  WHERE d.school_id = NEW.school_id
    AND d.course_id = NEW.course_id
    AND d.status = 'ACTIVE'
    AND (TG_OP = 'INSERT' OR d.id <> NEW.id);

  IF active_delivery_count >= delivery_limit THEN
    RAISE EXCEPTION 'deliveries exceed the subscription delivery limit'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deliveries_require_active_subscription
BEFORE INSERT OR UPDATE OF status ON deliveries
FOR EACH ROW
EXECUTE FUNCTION guard_delivery_subscription();

ALTER TABLE delivery_enrollments
  ADD CONSTRAINT delivery_enrollments_status_ended_at
    CHECK ((status = 'ACTIVE') = (ended_at IS NULL)),
  ADD CONSTRAINT delivery_enrollments_ended_after_enrolled
    CHECK (ended_at IS NULL OR ended_at >= enrolled_at);

CREATE FUNCTION guard_delivery_enrollment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  student_class_section_id uuid;
  student_status text;
  delivery_class_section_id uuid;
  delivery_status text;
  delivery_course_id uuid;
BEGIN
  IF NEW.enrolled_by_id IS NOT NULL
     AND NOT actor_in_scope(NEW.enrolled_by_id, NEW.school_id) THEN
    RAISE EXCEPTION 'delivery_enrollments.enrolled_by_id must be in school scope'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NEW.ended_by_id IS NOT NULL
     AND NOT actor_in_scope(NEW.ended_by_id, NEW.school_id) THEN
    RAISE EXCEPTION 'delivery_enrollments.ended_by_id must be in school scope'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status <> 'ACTIVE' AND NEW.status = 'ACTIVE') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT sp.class_section_id, u.status::text
  INTO student_class_section_id, student_status
  FROM student_profiles sp
  JOIN users u ON u.id = sp.user_id
  WHERE sp.user_id = NEW.student_id
    AND sp.school_id = NEW.school_id
  FOR SHARE OF sp, u;

  SELECT d.class_section_id, d.status::text, d.course_id
  INTO delivery_class_section_id, delivery_status, delivery_course_id
  FROM deliveries d
  WHERE d.id = NEW.delivery_id
    AND d.school_id = NEW.school_id
  FOR SHARE;

  IF student_class_section_id IS DISTINCT FROM delivery_class_section_id THEN
    RAISE EXCEPTION 'delivery_enrollments require the student and delivery class sections to match'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF student_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'delivery_enrollments require an ACTIVE student'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF delivery_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'delivery_enrollments require an ACTIVE delivery'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NOT has_course_access(NEW.school_id, delivery_course_id, business_today()) THEN
    RAISE EXCEPTION 'delivery_enrollments require current course access'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_enrollments_validate
BEFORE INSERT OR UPDATE OF status, enrolled_by_id, ended_by_id ON delivery_enrollments
FOR EACH ROW
EXECUTE FUNCTION guard_delivery_enrollment();

CREATE TRIGGER trg_delivery_enrollments_immutable_identity
BEFORE UPDATE OF school_id, delivery_id, student_id ON delivery_enrollments
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('school_id', 'delivery_id', 'student_id');

CREATE FUNCTION guard_delivery_lesson_release()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  lesson_status text;
  lesson_audience text;
  module_status text;
  delivery_status text;
BEGIN
  IF NEW.released_by_id IS NOT NULL
     AND NOT actor_in_scope(NEW.released_by_id, NEW.school_id) THEN
    RAISE EXCEPTION 'delivery_lesson_releases.released_by_id must be in school scope'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  SELECT l.status::text, l.audience::text, m.status::text
  INTO lesson_status, lesson_audience, module_status
  FROM lessons l
  JOIN modules m ON m.id = l.module_id
  WHERE l.id = NEW.lesson_id
    AND l.course_id = NEW.course_id
  FOR SHARE OF l, m;

  IF module_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'delivery_lesson_releases require an ACTIVE module'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF lesson_status IS DISTINCT FROM 'ACTIVE'
     OR lesson_audience IS DISTINCT FROM 'STUDENT' THEN
    RAISE EXCEPTION 'delivery_lesson_releases require an ACTIVE STUDENT lesson'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  SELECT d.status::text
  INTO delivery_status
  FROM deliveries d
  WHERE d.id = NEW.delivery_id
    AND d.school_id = NEW.school_id
    AND d.course_id = NEW.course_id
  FOR SHARE;

  IF delivery_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'delivery_lesson_releases require an ACTIVE delivery'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NOT has_course_access(NEW.school_id, NEW.course_id, business_today()) THEN
    RAISE EXCEPTION 'delivery_lesson_releases require current course access'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_lesson_releases_validate
BEFORE INSERT ON delivery_lesson_releases
FOR EACH ROW
EXECUTE FUNCTION guard_delivery_lesson_release();

CREATE TRIGGER trg_delivery_lesson_releases_immutable_identity
BEFORE UPDATE OF school_id, course_id, delivery_id, lesson_id ON delivery_lesson_releases
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('school_id', 'course_id', 'delivery_id', 'lesson_id');

CREATE UNIQUE INDEX "delivery_teacher_active_unique"
  ON "delivery_teachers" ("delivery_id", "teacher_id")
  WHERE "removed_at" IS NULL;