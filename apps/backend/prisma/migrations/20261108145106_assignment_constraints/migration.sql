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

CREATE FUNCTION guard_assignment_template_creator()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  creator_type text;
BEGIN
  IF NEW.created_by_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_type::text
  INTO creator_type
  FROM users
  WHERE id = NEW.created_by_id
  FOR SHARE;

  IF creator_type IS DISTINCT FROM 'PLATFORM_STAFF' THEN
    RAISE EXCEPTION 'assignment_templates.created_by_id must be PLATFORM_STAFF'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignment_templates_creator
BEFORE INSERT OR UPDATE OF created_by_id ON assignment_templates
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_template_creator();

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

CREATE FUNCTION guard_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  template_status text;
  template_course_id uuid;
  template_module_id uuid;
  template_lesson_id uuid;
  creator_type text;
  creator_changed boolean;
  delivery_status text;
  lesson_audience text;
  single_choice_count bigint;
  other_item_count bigint;
  has_invalid_single_choice boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'assignments must be inserted as DRAFT'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NEW.source_template_id IS NOT NULL THEN
      SELECT status::text, course_id, module_id, lesson_id
      INTO template_status, template_course_id, template_module_id, template_lesson_id
      FROM assignment_templates
      WHERE id = NEW.source_template_id
      FOR SHARE;

      IF template_status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'assignments require an ACTIVE source template'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = TG_NAME;
      END IF;

      IF template_course_id IS DISTINCT FROM NEW.course_id THEN
        RAISE EXCEPTION 'assignments source template must be in the same course'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = TG_NAME;
      END IF;

      NEW.module_id := template_module_id;
      NEW.lesson_id := template_lesson_id;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    creator_changed := true;
  ELSE
    creator_changed := NEW.created_by_id IS DISTINCT FROM OLD.created_by_id;
  END IF;

  IF NEW.created_by_id IS NOT NULL AND creator_changed THEN
    IF NOT actor_in_scope(NEW.created_by_id, NEW.school_id) THEN
      RAISE EXCEPTION 'assignments.created_by_id must be in school scope'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT user_type::text
    INTO creator_type
    FROM users
    WHERE id = NEW.created_by_id
    FOR SHARE;

    IF creator_type IS DISTINCT FROM 'PLATFORM_STAFF'
       AND NOT EXISTS (
         SELECT 1
         FROM delivery_teachers dt
         WHERE dt.delivery_id = NEW.delivery_id
           AND dt.school_id = NEW.school_id
           AND dt.teacher_id = NEW.created_by_id
           AND dt.removed_at IS NULL
       ) THEN
      RAISE EXCEPTION 'assignments.created_by_id must be an active teacher of the delivery'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         (OLD.status = 'DRAFT' AND NEW.status = 'PUBLISHED')
         OR (OLD.status = 'PUBLISHED' AND NEW.status = 'UNPUBLISHED')
         OR (OLD.status = 'UNPUBLISHED' AND NEW.status = 'PUBLISHED')
       ) THEN
      RAISE EXCEPTION 'assignments cannot transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF OLD.published_at IS NOT NULL
       AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'assignments.published_at is immutable after first publish'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = OLD.id)
       AND (to_jsonb(NEW) - ARRAY[
         'title',
         'description',
         'due_at',
         'allow_resubmission',
         'status',
         'updated_at'
       ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
         'title',
         'description',
         'due_at',
         'allow_resubmission',
         'status',
         'updated_at'
       ]) THEN
      RAISE EXCEPTION 'assignments are frozen after the first submission'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF OLD.published_at IS NULL AND NEW.status = 'PUBLISHED' THEN
      NEW.published_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'PUBLISHED'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT status::text
    INTO delivery_status
    FROM deliveries
    WHERE id = NEW.delivery_id
      AND school_id = NEW.school_id
      AND course_id = NEW.course_id
    FOR SHARE;

    IF delivery_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'assignments can be published only for an ACTIVE delivery'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NOT has_course_access(NEW.school_id, NEW.course_id, business_today()) THEN
      RAISE EXCEPTION 'assignments require current course access to publish'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM assignment_items ai
      WHERE ai.assignment_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'assignments require at least one item to publish'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT count(*) FILTER (WHERE type = 'SINGLE_CHOICE'),
           count(*) FILTER (WHERE type <> 'SINGLE_CHOICE')
    INTO single_choice_count, other_item_count
    FROM assignment_items
    WHERE assignment_id = NEW.id;

    IF single_choice_count > 0 AND other_item_count > 0 THEN
      RAISE EXCEPTION 'assignments cannot mix SINGLE_CHOICE items with other item types'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF single_choice_count > 0 THEN
      IF NEW.rubric IS NOT NULL THEN
        RAISE EXCEPTION 'assignments with SINGLE_CHOICE items cannot have a rubric'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = TG_NAME;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM assignment_items ai
        WHERE ai.assignment_id = NEW.id
          AND ai.type = 'SINGLE_CHOICE'
          AND (
            (SELECT count(*)
             FROM assignment_item_options aio
             WHERE aio.item_id = ai.id) < 2
            OR
            (SELECT count(*)
             FROM assignment_item_options aio
             WHERE aio.item_id = ai.id
               AND aio.is_correct) <> 1
          )
      )
      INTO has_invalid_single_choice;

      IF has_invalid_single_choice THEN
        RAISE EXCEPTION 'each SINGLE_CHOICE item requires at least two options and exactly one correct option'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = TG_NAME;
      END IF;
    END IF;

    IF NEW.lesson_id IS NOT NULL THEN
      SELECT audience::text
      INTO lesson_audience
      FROM lessons
      WHERE id = NEW.lesson_id
        AND course_id = NEW.course_id
      FOR SHARE;

      IF lesson_audience = 'TEACHER_ONLY' THEN
        RAISE EXCEPTION 'assignments cannot be anchored to a TEACHER_ONLY lesson'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = TG_NAME;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_guard
BEFORE INSERT OR UPDATE ON assignments
FOR EACH ROW
EXECUTE FUNCTION guard_assignment();

ALTER TABLE assignment_items
  ADD CONSTRAINT assignment_items_position_positive
    CHECK (position >= 1),
  ADD CONSTRAINT assignment_items_prompt_nonempty
    CHECK (length(btrim(prompt)) > 0),
  ADD CONSTRAINT assignment_items_config_object
    CHECK (config IS NULL OR jsonb_typeof(config) = 'object');

CREATE FUNCTION guard_assignment_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_assignment_id uuid;
  new_assignment_id uuid;
BEGIN
  IF is_purging() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    old_assignment_id := OLD.assignment_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_assignment_id := NEW.assignment_id;
  END IF;

  IF (old_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions WHERE assignment_id = old_assignment_id
      ))
     OR (new_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions WHERE assignment_id = new_assignment_id
      )) THEN
    RAISE EXCEPTION 'assignment_items are frozen after the first submission'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignment_items_freeze
BEFORE INSERT OR UPDATE OR DELETE ON assignment_items
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_item();

ALTER TABLE assignment_item_options
  ADD CONSTRAINT assignment_item_options_position_positive
    CHECK (position >= 1),
  ADD CONSTRAINT assignment_item_options_text_nonempty
    CHECK (length(btrim(text)) > 0);

CREATE UNIQUE INDEX assignment_item_options_one_correct_uq
  ON assignment_item_options (item_id)
  WHERE is_correct;

CREATE FUNCTION guard_assignment_item_option()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_assignment_id uuid;
  new_assignment_id uuid;
  parent_type text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT assignment_id
    INTO old_assignment_id
    FROM assignment_items
    WHERE id = OLD.item_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT assignment_id, type::text
    INTO new_assignment_id, parent_type
    FROM assignment_items
    WHERE id = NEW.item_id
    FOR SHARE;

    IF parent_type IS DISTINCT FROM 'SINGLE_CHOICE' THEN
      RAISE EXCEPTION 'assignment_item_options require a SINGLE_CHOICE parent item'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  IF NOT is_purging()
     AND ((old_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions WHERE assignment_id = old_assignment_id
      ))
     OR (new_assignment_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM submissions WHERE assignment_id = new_assignment_id
      ))) THEN
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

CREATE TRIGGER trg_assignment_item_options_guard
BEFORE INSERT OR UPDATE OR DELETE ON assignment_item_options
FOR EACH ROW
EXECUTE FUNCTION guard_assignment_item_option();

ALTER TABLE submissions
  ADD CONSTRAINT submissions_graded_at_matches_status
    CHECK ((status = 'GRADED') = (graded_at IS NOT NULL)),
  ADD CONSTRAINT submissions_grade_percent_matches_status
    CHECK ((status = 'GRADED') = (grade_percent IS NOT NULL)),
  ADD CONSTRAINT submissions_grade_percent_range
    CHECK (grade_percent IS NULL OR grade_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT submissions_rubric_levels_array
    CHECK (rubric_levels IS NULL OR jsonb_typeof(rubric_levels) = 'array');

CREATE TRIGGER trg_submissions_immutable_identity
BEFORE UPDATE OF assignment_id, delivery_id, student_id ON submissions
FOR EACH ROW
EXECUTE FUNCTION reject_column_change('assignment_id', 'delivery_id', 'student_id');

CREATE FUNCTION guard_submission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_status text;
  assignment_due_at timestamptz;
  assignment_course_id uuid;
  assignment_allows_resubmission boolean;
  enrollment_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT a.status::text, a.due_at, a.course_id, a.allow_resubmission
    INTO assignment_status, assignment_due_at, assignment_course_id, assignment_allows_resubmission
    FROM assignments a
    WHERE a.id = NEW.assignment_id
      AND a.delivery_id = NEW.delivery_id
    FOR SHARE;

    IF assignment_status IS DISTINCT FROM 'PUBLISHED' THEN
      RAISE EXCEPTION 'submissions require a PUBLISHED assignment'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT status::text
    INTO enrollment_status
    FROM delivery_enrollments
    WHERE delivery_id = NEW.delivery_id
      AND student_id = NEW.student_id
      AND school_id = NEW.school_id
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
    NEW.status := 'SUBMITTED';
    NEW.grade_percent := NULL;
    NEW.rubric_levels := NULL;
    NEW.overall_feedback := NULL;
    NEW.graded_by_id := NULL;
    NEW.graded_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.due_at_at_submission IS DISTINCT FROM OLD.due_at_at_submission THEN
    IF NEW.due_at_at_submission IS DISTINCT FROM OLD.due_at_at_submission
       AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'submissions.due_at_at_submission cannot change without a resubmit'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT a.status::text, a.due_at, a.course_id, a.allow_resubmission
    INTO assignment_status, assignment_due_at, assignment_course_id, assignment_allows_resubmission
    FROM assignments a
    WHERE a.id = NEW.assignment_id
      AND a.delivery_id = NEW.delivery_id
    FOR SHARE;

    IF assignment_status IS DISTINCT FROM 'PUBLISHED' THEN
      RAISE EXCEPTION 'resubmissions require a PUBLISHED assignment'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NOT assignment_allows_resubmission THEN
      RAISE EXCEPTION 'assignment does not allow resubmissions'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT status::text
    INTO enrollment_status
    FROM delivery_enrollments
    WHERE delivery_id = NEW.delivery_id
      AND student_id = NEW.student_id
      AND school_id = NEW.school_id
    FOR SHARE;

    IF enrollment_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'resubmissions require an ACTIVE enrollment'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    IF NOT has_course_access(NEW.school_id, assignment_course_id, business_today()) THEN
      RAISE EXCEPTION 'resubmissions require current course access'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    NEW.submitted_at := now();
    NEW.due_at_at_submission := assignment_due_at;
    NEW.status := 'SUBMITTED';
    NEW.grade_percent := NULL;
    NEW.rubric_levels := NULL;
    NEW.overall_feedback := NULL;
    NEW.graded_by_id := NULL;
    NEW.graded_at := NULL;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ARRAY[
        'status',
        'grade_percent',
        'rubric_levels',
        'overall_feedback',
        'graded_by_id',
        'graded_at',
        'updated_at'
      ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
        'status',
        'grade_percent',
        'rubric_levels',
        'overall_feedback',
        'graded_by_id',
        'graded_at',
        'updated_at'
      ]) THEN
    RAISE EXCEPTION 'submissions allow only grading updates outside resubmission'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submissions_guard
BEFORE INSERT OR UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION guard_submission();

CREATE FUNCTION check_submission_grader()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'GRADED' OR NEW.graded_by_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT actor_in_scope(NEW.graded_by_id, NEW.school_id) THEN
    RAISE EXCEPTION 'submissions.graded_by_id must be in school scope'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = NEW.graded_by_id
      AND u.user_type = 'PLATFORM_STAFF'
  ) AND NOT EXISTS (
    SELECT 1
    FROM delivery_teachers dt
    WHERE dt.delivery_id = NEW.delivery_id
      AND dt.school_id = NEW.school_id
      AND dt.teacher_id = NEW.graded_by_id
      AND dt.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'submissions.graded_by_id must be an active teacher of the delivery'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_submissions_graded_by_scope
AFTER INSERT OR UPDATE ON submissions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_submission_grader();

CREATE FUNCTION guard_submission_answer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_type text;
  parent_submitted_at timestamptz;
  option_is_correct boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'submission_answers do not allow updates'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF is_purging() THEN
      RETURN OLD;
    END IF;

    SELECT submitted_at
    INTO parent_submitted_at
    FROM submissions
    WHERE id = OLD.submission_id
      AND assignment_id = OLD.assignment_id
      AND school_id = OLD.school_id;

    IF parent_submitted_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'submission_answers may be deleted only during submit or resubmit'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    RETURN OLD;
  END IF;

  SELECT ai.type::text, s.submitted_at
  INTO item_type, parent_submitted_at
  FROM submissions s
  JOIN assignment_items ai
    ON ai.assignment_id = s.assignment_id
  WHERE s.id = NEW.submission_id
    AND s.assignment_id = NEW.assignment_id
    AND s.school_id = NEW.school_id
    AND ai.id = NEW.item_id;

  IF NOT is_purging() AND parent_submitted_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'submission_answers may be inserted only during submit or resubmit'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF item_type = 'SINGLE_CHOICE' THEN
    IF NEW.selected_option_id IS NULL OR NEW.answer_text IS NOT NULL THEN
      RAISE EXCEPTION 'SINGLE_CHOICE answers require only selected_option_id'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    SELECT is_correct
    INTO option_is_correct
    FROM assignment_item_options
    WHERE id = NEW.selected_option_id
      AND item_id = NEW.item_id;

    NEW.is_correct := option_is_correct;
  ELSIF item_type = 'TEXT' THEN
    IF NEW.answer_text IS NULL OR NEW.selected_option_id IS NOT NULL THEN
      RAISE EXCEPTION 'TEXT answers require only answer_text'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    NEW.is_correct := NULL;
  ELSE
    RAISE EXCEPTION 'FILE_UPLOAD items do not accept submission_answers'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submission_answers_guard
BEFORE INSERT OR UPDATE OR DELETE ON submission_answers
FOR EACH ROW
EXECUTE FUNCTION guard_submission_answer();

ALTER TABLE submission_files
  ADD CONSTRAINT submission_files_size_positive
    CHECK (size_bytes > 0),
  ADD CONSTRAINT submission_files_storage_key_school_prefix
    CHECK (storage_key LIKE 'submissions/' || school_id::text || '/%');

CREATE FUNCTION guard_submission_file()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item_type text;
  parent_submitted_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'submission_files do not allow updates'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF is_purging() THEN
      RETURN OLD;
    END IF;

    SELECT submitted_at
    INTO parent_submitted_at
    FROM submissions
    WHERE id = OLD.submission_id
      AND assignment_id = OLD.assignment_id
      AND school_id = OLD.school_id;

    IF parent_submitted_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'submission_files may be deleted only during submit or resubmit'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;

    RETURN OLD;
  END IF;

  SELECT ai.type::text, s.submitted_at
  INTO item_type, parent_submitted_at
  FROM submissions s
  JOIN assignment_items ai
    ON ai.assignment_id = s.assignment_id
  WHERE s.id = NEW.submission_id
    AND s.assignment_id = NEW.assignment_id
    AND s.school_id = NEW.school_id
    AND ai.id = NEW.item_id;

  IF NOT is_purging() AND parent_submitted_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'submission_files may be inserted only during submit or resubmit'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF item_type IS DISTINCT FROM 'FILE_UPLOAD' THEN
    RAISE EXCEPTION 'submission_files require a FILE_UPLOAD item'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submission_files_guard
BEFORE INSERT OR UPDATE OR DELETE ON submission_files
FOR EACH ROW
EXECUTE FUNCTION guard_submission_file();
