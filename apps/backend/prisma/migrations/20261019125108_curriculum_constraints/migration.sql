ALTER TABLE "courses"
  ADD CONSTRAINT "courses_title_nonempty"
  CHECK (length(btrim("title")) > 0);

ALTER TABLE "modules"
  ADD CONSTRAINT "modules_title_nonempty"
  CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "modules_position_positive"
  CHECK ("position" >= 1);

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_title_nonempty"
  CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "lessons_position_positive"
  CHECK ("position" >= 1);

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_title_nonempty"
  CHECK (length(btrim("title")) > 0);

ALTER TABLE "lesson_blocks"
  ADD CONSTRAINT "lesson_blocks_content_object"
  CHECK (jsonb_typeof("content") = 'object'),
  ADD CONSTRAINT "lesson_blocks_asset_shape"
  CHECK (("type" IN ('IMAGE', 'VIDEO', 'PDF', 'PPTX')) = ("asset_id" IS NOT NULL)),
  ADD CONSTRAINT "lesson_blocks_parent_position_shape"
  CHECK (("parent_block_id" IS NULL) = ("position" IS NOT NULL)),
  ADD CONSTRAINT "lesson_blocks_parent_column_shape"
  CHECK (("parent_block_id" IS NULL) = ("column_index" IS NULL)),
  ADD CONSTRAINT "lesson_blocks_column_index_range"
  CHECK ("column_index" IS NULL OR "column_index" IN (0, 1)),
  ADD CONSTRAINT "lesson_blocks_position_positive"
  CHECK ("position" IS NULL OR "position" >= 1),
  ADD CONSTRAINT "lesson_blocks_no_nested_two_column"
  CHECK ("parent_block_id" IS NULL OR "type" <> 'TWO_COLUMN');

ALTER TABLE "asset_files"
  ADD CONSTRAINT "asset_files_ready_requirements"
  CHECK ("status" <> 'READY' OR (
    "mime_type" IS NOT NULL AND "size_bytes" IS NOT NULL AND "size_bytes" > 0
  )),
  ADD CONSTRAINT "asset_files_size_positive"
  CHECK ("size_bytes" IS NULL OR "size_bytes" > 0),
  ADD CONSTRAINT "asset_files_storage_key_prefix"
  CHECK ("storage_key" LIKE 'assets/' || "asset_id"::text || '/' || "id"::text || '/_%'),
  ADD CONSTRAINT "asset_files_playback_key_prefix"
  CHECK ("playback_key" IS NULL OR
    "playback_key" LIKE 'assets/' || "asset_id"::text || '/' || "id"::text || '/_%');

CREATE UNIQUE INDEX "asset_files_one_ready_per_asset"
  ON "asset_files" ("asset_id") WHERE "status" = 'READY';

ALTER TABLE "storage_cleanup_queue"
  ADD CONSTRAINT "storage_cleanup_queue_done_after_queued"
  CHECK ("done_at" IS NULL OR "done_at" >= "queued_at");

CREATE INDEX "storage_cleanup_queue_queued_at_pending_idx"
  ON "storage_cleanup_queue" ("queued_at") WHERE "done_at" IS NULL;

CREATE UNIQUE INDEX "storage_cleanup_queue_object_key_pending_key"
  ON "storage_cleanup_queue" ("object_key") WHERE "done_at" IS NULL;

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
    IF column_name IS NULL OR NOT (old_row ? column_name) THEN
      RAISE EXCEPTION 'reject_column_change: unknown column %', column_name
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF (new_row -> column_name) IS DISTINCT FROM (old_row -> column_name) THEN
      RAISE EXCEPTION '% is immutable', TG_TABLE_NAME || '.' || column_name
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_modules_immutable_course_id"
BEFORE UPDATE OF "course_id" ON "modules"
FOR EACH ROW EXECUTE FUNCTION reject_column_change('course_id');

CREATE TRIGGER "trg_lessons_immutable_course_id"
BEFORE UPDATE OF "course_id" ON "lessons"
FOR EACH ROW EXECUTE FUNCTION reject_column_change('course_id');

CREATE TRIGGER "trg_assets_immutable_type"
BEFORE UPDATE OF "type" ON "assets"
FOR EACH ROW EXECUTE FUNCTION reject_column_change('type');

CREATE TRIGGER "trg_lesson_blocks_immutable_identity"
BEFORE UPDATE OF "type", "lesson_id" ON "lesson_blocks"
FOR EACH ROW EXECUTE FUNCTION reject_column_change('type', 'lesson_id');

CREATE FUNCTION guard_content_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    RAISE EXCEPTION '% cannot return to DRAFT', TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_courses_no_return_to_draft"
BEFORE UPDATE OF "status" ON "courses"
FOR EACH ROW EXECUTE FUNCTION guard_content_status_transition();

CREATE TRIGGER "trg_modules_no_return_to_draft"
BEFORE UPDATE OF "status" ON "modules"
FOR EACH ROW EXECUTE FUNCTION guard_content_status_transition();

CREATE TRIGGER "trg_lessons_no_return_to_draft"
BEFORE UPDATE OF "status" ON "lessons"
FOR EACH ROW EXECUTE FUNCTION guard_content_status_transition();

CREATE FUNCTION guard_child_content_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "content_status";
BEGIN
  IF TG_TABLE_NAME = 'modules' THEN
    IF NEW."status" <> 'ACTIVE' THEN
      RETURN NEW;
    END IF;

    SELECT "status" INTO parent_status
    FROM "courses"
    WHERE "id" = NEW."course_id"
    FOR SHARE;

    IF parent_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'modules require an ACTIVE course'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  ELSE
    IF NEW."status" <> 'ACTIVE' THEN
      RETURN NEW;
    END IF;

    SELECT "status" INTO parent_status
    FROM "modules"
    WHERE "id" = NEW."module_id"
    FOR SHARE;

    IF parent_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'lessons require an ACTIVE module'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_modules_require_active_course"
BEFORE INSERT OR UPDATE OF "status" ON "modules"
FOR EACH ROW EXECUTE FUNCTION guard_child_content_status();

CREATE TRIGGER "trg_lessons_require_active_module"
BEFORE INSERT OR UPDATE OF "status", "module_id" ON "lessons"
FOR EACH ROW EXECUTE FUNCTION guard_child_content_status();

CREATE FUNCTION archive_active_content_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> 'ARCHIVED' OR OLD."status" = 'ARCHIVED' THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'courses' THEN
    UPDATE "modules"
    SET "status" = 'ARCHIVED'
    WHERE "course_id" = NEW."id" AND "status" = 'ACTIVE';
  ELSIF TG_TABLE_NAME = 'modules' THEN
    UPDATE "lessons"
    SET "status" = 'ARCHIVED'
    WHERE "module_id" = NEW."id" AND "status" = 'ACTIVE';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "trg_courses_archive_active_modules"
AFTER UPDATE OF "status" ON "courses"
FOR EACH ROW EXECUTE FUNCTION archive_active_content_children();

CREATE TRIGGER "trg_modules_archive_active_lessons"
AFTER UPDATE OF "status" ON "modules"
FOR EACH ROW EXECUTE FUNCTION archive_active_content_children();

CREATE FUNCTION guard_new_course_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  course_status "content_status";
BEGIN
  SELECT "status" INTO course_status
  FROM "courses"
  WHERE "id" = NEW."course_id"
  FOR SHARE;

  IF TG_TABLE_NAME = 'subscriptions' AND course_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'subscriptions require an ACTIVE course'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  ELSIF TG_TABLE_NAME = 'deliveries' AND course_status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'deliveries cannot reference an ARCHIVED course'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_subscriptions_require_active_course"
BEFORE INSERT OR UPDATE OF "course_id" ON "subscriptions"
FOR EACH ROW EXECUTE FUNCTION guard_new_course_use();

CREATE TRIGGER "trg_deliveries_reject_archived_course"
BEFORE INSERT OR UPDATE OF "course_id" ON "deliveries"
FOR EACH ROW EXECUTE FUNCTION guard_new_course_use();

CREATE FUNCTION guard_lesson_block_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_type "block_type";
  asset_type "asset_type";
BEGIN
  IF NEW."parent_block_id" IS NOT NULL THEN
    SELECT "type" INTO parent_type
    FROM "lesson_blocks"
    WHERE "id" = NEW."parent_block_id" AND "lesson_id" = NEW."lesson_id";

    IF parent_type IS DISTINCT FROM 'TWO_COLUMN' THEN
      RAISE EXCEPTION 'lesson_blocks parent must be TWO_COLUMN'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  IF NEW."asset_id" IS NOT NULL THEN
    SELECT "type" INTO asset_type
    FROM "assets"
    WHERE "id" = NEW."asset_id";

    IF asset_type::text IS DISTINCT FROM NEW."type"::text THEN
      RAISE EXCEPTION 'lesson_blocks asset type must match block type'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_lesson_blocks_validate_references"
BEFORE INSERT OR UPDATE ON "lesson_blocks"
FOR EACH ROW EXECUTE FUNCTION guard_lesson_block_references();

CREATE FUNCTION guard_asset_file_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  asset_type "asset_type";
BEGIN
  IF TG_OP = 'INSERT' AND NEW."status" <> 'UPLOADING' THEN
    RAISE EXCEPTION 'asset_files must start in UPLOADING'
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" IN ('READY', 'FAILED') THEN
    RAISE EXCEPTION 'asset_files row with status % cannot be updated', OLD."status"
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."status" IS DISTINCT FROM OLD."status"
     AND NOT (
       (OLD."status" = 'UPLOADING' AND NEW."status" IN ('UPLOADED', 'FAILED'))
       OR (OLD."status" = 'UPLOADED' AND NEW."status" IN ('PROCESSING', 'FAILED'))
       OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('READY', 'FAILED'))
     ) THEN
    RAISE EXCEPTION 'invalid asset_files status transition: % -> %', OLD."status", NEW."status"
      USING ERRCODE = 'integrity_constraint_violation',
        CONSTRAINT = TG_NAME;
  END IF;

  IF NEW."status" = 'READY' THEN
    SELECT "type" INTO asset_type
    FROM "assets"
    WHERE "id" = NEW."asset_id";

    IF asset_type = 'VIDEO' AND NEW."playback_key" IS NULL THEN
      RAISE EXCEPTION 'VIDEO asset_files require playback_key when READY'
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = TG_NAME;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_asset_files_guard_update"
BEFORE INSERT OR UPDATE ON "asset_files"
FOR EACH ROW EXECUTE FUNCTION guard_asset_file_update();

CREATE FUNCTION enqueue_asset_file_cleanup_prefix()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cleanup_prefix text;
BEGIN
  cleanup_prefix := 'assets/' || OLD."asset_id"::text || '/' || OLD."id"::text || '/';

  INSERT INTO "storage_cleanup_queue" ("id", "object_key", "is_prefix", "queued_at")
  VALUES (gen_random_uuid(), cleanup_prefix, true, now())
  ON CONFLICT ("object_key") WHERE "done_at" IS NULL DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "trg_asset_files_enqueue_cleanup_prefix"
AFTER DELETE ON "asset_files"
FOR EACH ROW EXECUTE FUNCTION enqueue_asset_file_cleanup_prefix();

CREATE FUNCTION enqueue_submission_file_cleanup_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "storage_cleanup_queue" ("id", "object_key", "is_prefix", "queued_at")
  VALUES (gen_random_uuid(), OLD."storage_key", false, now())
  ON CONFLICT ("object_key") WHERE "done_at" IS NULL DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "trg_submission_files_enqueue_cleanup_key"
AFTER DELETE ON "submission_files"
FOR EACH ROW EXECUTE FUNCTION enqueue_submission_file_cleanup_key();
