CREATE OR REPLACE FUNCTION is_purging()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('steamx.purge', true) = 'on', false);
$$;

ALTER TABLE assignment_templates
  ADD CONSTRAINT assignment_templates_anchor
    CHECK (num_nonnulls(module_id, lesson_id) <= 1),
  ADD CONSTRAINT assignment_templates_title_nonempty
    CHECK (length(btrim(title)) > 0),
  ADD CONSTRAINT assignment_templates_blueprint_object
    CHECK (jsonb_typeof(blueprint) = 'object');

ALTER TABLE assignments
  ADD CONSTRAINT assignments_anchor
    CHECK (num_nonnulls(module_id, lesson_id) <= 1),
  ADD CONSTRAINT assignments_draft_published_at
    CHECK ((status = 'DRAFT') = (published_at IS NULL)),
  ADD CONSTRAINT assignments_due_at_required_when_published
    CHECK (status <> 'PUBLISHED' OR due_at IS NOT NULL),
  ADD CONSTRAINT assignments_rubric_array
    CHECK (rubric IS NULL OR jsonb_typeof(rubric) = 'array'),
  ADD CONSTRAINT assignments_title_nonempty
    CHECK (length(btrim(title)) > 0);

CREATE UNIQUE INDEX assignments_delivery_source_template_uq
  ON assignments (delivery_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE TRIGGER trg_assignments_immutable_identity
BEFORE UPDATE OF delivery_id, school_id, course_id, source_template_id ON assignments
FOR EACH ROW
EXECUTE FUNCTION reject_column_change(
  'delivery_id',
  'school_id',
  'course_id',
  'source_template_id'
);

CREATE FUNCTION guard_assignment_content_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND (
    NEW.rubric IS DISTINCT FROM OLD.rubric
    OR NEW.module_id IS DISTINCT FROM OLD.module_id
    OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
  ) THEN
    RAISE EXCEPTION 'published assignments must be unpublished before editing content'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM submissions s
    WHERE s.assignment_id = OLD.id
  ) AND (
    NEW.rubric IS DISTINCT FROM OLD.rubric
    OR NEW.module_id IS DISTINCT FROM OLD.module_id
    OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
  ) THEN
    RAISE EXCEPTION 'assignments rubric and anchor are frozen after the first submission'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_content_freeze
BEFORE UPDATE ON assignments
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_content_freeze();

ALTER TABLE assignment_items
  ADD CONSTRAINT assignment_items_position_positive
    CHECK (position >= 1),
  ADD CONSTRAINT assignment_items_prompt_nonempty
    CHECK (length(btrim(prompt)) > 0),
  ADD CONSTRAINT assignment_items_config_object
    CHECK (config IS NULL OR jsonb_typeof(config) = 'object');

CREATE FUNCTION guard_assignment_item_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_status text;
  new_status text;
BEGIN
  IF is_purging() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT a.status::text
    INTO new_status
    FROM assignments a
    WHERE a.id = NEW.assignment_id;

    IF new_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published assignments must be unpublished before editing items'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF EXISTS (
      SELECT 1 FROM submissions s WHERE s.assignment_id = NEW.assignment_id
    ) THEN
      RAISE EXCEPTION 'assignment_items are frozen after the first submission'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT a.status::text
    INTO old_status
    FROM assignments a
    WHERE a.id = OLD.assignment_id;

    IF old_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published assignments must be unpublished before editing items'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF EXISTS (
      SELECT 1 FROM submissions s WHERE s.assignment_id = OLD.assignment_id
    ) THEN
      RAISE EXCEPTION 'assignment_items are frozen after the first submission'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
    RETURN OLD;
  END IF;

  SELECT a.status::text
  INTO old_status
  FROM assignments a
  WHERE a.id = OLD.assignment_id;

  SELECT a.status::text
  INTO new_status
  FROM assignments a
  WHERE a.id = NEW.assignment_id;

  IF old_status = 'PUBLISHED' OR new_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published assignments must be unpublished before editing items'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF EXISTS (
    SELECT 1 FROM submissions s WHERE s.assignment_id = OLD.assignment_id
  ) OR EXISTS (
    SELECT 1 FROM submissions s WHERE s.assignment_id = NEW.assignment_id
  ) THEN
    RAISE EXCEPTION 'assignment_items are frozen after the first submission'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignment_items_freeze
BEFORE INSERT OR UPDATE OR DELETE ON assignment_items
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_item_freeze();

ALTER TABLE assignment_item_options
  ADD CONSTRAINT assignment_item_options_position_positive
    CHECK (position >= 1),
  ADD CONSTRAINT assignment_item_options_text_nonempty
    CHECK (length(btrim(text)) > 0);

CREATE UNIQUE INDEX assignment_item_options_one_correct_uq
  ON assignment_item_options (item_id)
  WHERE is_correct;

CREATE FUNCTION guard_assignment_item_option_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_assignment_id uuid;
  new_assignment_id uuid;
  old_status text;
  new_status text;
BEGIN
  IF is_purging() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT ai.assignment_id
    INTO old_assignment_id
    FROM assignment_items ai
    WHERE ai.id = OLD.item_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT ai.assignment_id
    INTO new_assignment_id
    FROM assignment_items ai
    WHERE ai.id = NEW.item_id;
  END IF;

  IF old_assignment_id IS NOT NULL THEN
    SELECT a.status::text
    INTO old_status
    FROM assignments a
    WHERE a.id = old_assignment_id;
  END IF;

  IF new_assignment_id IS NOT NULL THEN
    SELECT a.status::text
    INTO new_status
    FROM assignments a
    WHERE a.id = new_assignment_id;
  END IF;

  IF old_status = 'PUBLISHED' OR new_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published assignments must be unpublished before editing options'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF (old_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions s WHERE s.assignment_id = old_assignment_id
      ))
     OR (new_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions s WHERE s.assignment_id = new_assignment_id
      )) THEN
    RAISE EXCEPTION 'assignment_item_options are frozen after the first submission'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignment_item_options_freeze
BEFORE INSERT OR UPDATE OR DELETE ON assignment_item_options
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_item_option_freeze();

ALTER TABLE submissions
  ADD CONSTRAINT submissions_graded_at_matches_status
    CHECK ((status = 'GRADED') = (graded_at IS NOT NULL)),
  ADD CONSTRAINT submissions_grade_percent_matches_status
    CHECK ((status = 'GRADED') = (grade_percent IS NOT NULL)),
  ADD CONSTRAINT submissions_grade_percent_range
    CHECK (grade_percent IS NULL OR grade_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT submissions_rubric_levels_array
    CHECK (rubric_levels IS NULL OR jsonb_typeof(rubric_levels) = 'array'),
  ADD CONSTRAINT submissions_ungraded_fields_null
    CHECK (
      status = 'GRADED'
      OR num_nonnulls(graded_at, grade_percent, rubric_levels, overall_feedback, graded_by_id) = 0
    );

CREATE TRIGGER trg_submissions_immutable_identity
BEFORE UPDATE OF assignment_id, delivery_id, student_id ON submissions
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('assignment_id', 'delivery_id', 'student_id');

CREATE FUNCTION guard_submission_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_status text;
  assignment_due_at timestamptz;
  assignment_course_id uuid;
  assignment_allow_resubmission boolean;
  enrollment_status text;
BEGIN
  SELECT a.status::text, a.due_at, a.course_id, a.allow_resubmission
  INTO assignment_status, assignment_due_at, assignment_course_id, assignment_allow_resubmission
  FROM assignments a
  WHERE a.id = NEW.assignment_id
    AND a.delivery_id = NEW.delivery_id
  FOR SHARE;

  IF TG_OP = 'UPDATE' THEN
    IF assignment_allow_resubmission IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'assignment does not allow resubmission'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NEW.status::text IS DISTINCT FROM 'SUBMITTED' THEN
      RAISE EXCEPTION 'resubmission must end in SUBMITTED status'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  IF assignment_status IS DISTINCT FROM 'PUBLISHED' THEN
    RAISE EXCEPTION 'submissions require a PUBLISHED assignment'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  SELECT e.status::text
  INTO enrollment_status
  FROM delivery_enrollments e
  WHERE e.delivery_id = NEW.delivery_id
    AND e.student_id = NEW.student_id
    AND e.school_id = NEW.school_id
  FOR SHARE;

  IF enrollment_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'submissions require an ACTIVE enrollment'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NOT has_course_access(NEW.school_id, assignment_course_id, business_today()) THEN
    RAISE EXCEPTION 'submissions require current course access'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  NEW.submitted_at := now();
  NEW.due_at_at_submission := assignment_due_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submissions_validate_insert
BEFORE INSERT ON submissions
FOR EACH ROW
EXECUTE FUNCTION guard_submission_insert();

CREATE TRIGGER trg_submissions_validate_resubmit
BEFORE UPDATE OF submitted_at, due_at_at_submission ON submissions
FOR EACH ROW
EXECUTE FUNCTION guard_submission_insert();

CREATE FUNCTION guard_submission_answer_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submission_answers do not allow updates'
    USING ERRCODE = 'integrity_constraint_violation',
      CONSTRAINT = TG_NAME;
END;
$$;

CREATE FUNCTION compute_submission_answer_correctness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.selected_option_id IS NULL THEN
    NEW.is_correct := NULL;
  ELSE
    SELECT aio.is_correct
    INTO NEW.is_correct
    FROM assignment_item_options aio
    WHERE aio.id = NEW.selected_option_id
      AND aio.item_id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submission_answers_compute_correctness
BEFORE INSERT ON submission_answers
FOR EACH ROW
EXECUTE FUNCTION compute_submission_answer_correctness();

CREATE TRIGGER trg_submission_answers_reject_update
BEFORE UPDATE ON submission_answers
FOR EACH ROW
EXECUTE FUNCTION guard_submission_answer_update();

ALTER TABLE submission_files
  ADD CONSTRAINT submission_files_size_positive
    CHECK (size_bytes > 0),
  ADD CONSTRAINT submission_files_storage_key_school_prefix
    CHECK (storage_key LIKE 'submissions/' || school_id::text || '/%');

CREATE FUNCTION guard_submission_file_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submission_files do not allow updates'
    USING ERRCODE = 'integrity_constraint_violation',
      CONSTRAINT = TG_NAME;
END;
$$;

CREATE TRIGGER trg_submission_files_reject_update
BEFORE UPDATE ON submission_files
FOR EACH ROW
EXECUTE FUNCTION guard_submission_file_update();
