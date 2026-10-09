-- CreateEnum
CREATE TYPE "user_type" AS ENUM ('PLATFORM_STAFF', 'SCHOOL_STAFF', 'STUDENT');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "school_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lesson_audience" AS ENUM ('TEACHER_ONLY', 'STUDENT');

-- CreateEnum
CREATE TYPE "asset_type" AS ENUM ('IMAGE', 'VIDEO', 'PDF', 'PPTX');

-- CreateEnum
CREATE TYPE "asset_file_status" AS ENUM ('UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "block_type" AS ENUM ('RICH_TEXT', 'IMAGE', 'VIDEO', 'PDF', 'PPTX', 'ACCORDION', 'TWO_COLUMN');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'REMOVED');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "item_type" AS ENUM ('SINGLE_CHOICE', 'TEXT', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('SUBMITTED', 'GRADED');

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street_address" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "school_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_type" "user_type" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "steamx_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role_id" INTEGER NOT NULL,
    "user_type" "user_type" NOT NULL,
    "school_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_type" "user_type" NOT NULL DEFAULT 'STUDENT',
    "guardian_name" TEXT,
    "class_section_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_type" "user_type" NOT NULL DEFAULT 'SCHOOL_STAFF',
    "primary_assignment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "class_sections" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_name" TEXT NOT NULL,
    "section_name" TEXT NOT NULL DEFAULT 'All',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "class_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "audience" "lesson_audience" NOT NULL DEFAULT 'TEACHER_ONLY',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "type" "asset_type" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_files" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "status" "asset_file_status" NOT NULL DEFAULT 'UPLOADING',
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "playback_key" TEXT,
    "upload_id" TEXT,
    "processing_job_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_blocks" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "type" "block_type" NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "asset_id" UUID,
    "position" INTEGER,
    "parent_block_id" UUID,
    "column_index" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "max_deliveries" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "status" "delivery_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_teachers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" UUID,
    "removed_at" TIMESTAMPTZ,
    "removed_by_id" UUID,

    CONSTRAINT "delivery_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_lesson_releases" (
    "delivery_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "released_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by_id" UUID,

    CONSTRAINT "delivery_lesson_releases_pkey" PRIMARY KEY ("delivery_id","lesson_id")
);

-- CreateTable
CREATE TABLE "delivery_enrollments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by_id" UUID,
    "ended_at" TIMESTAMPTZ,
    "ended_by_id" UUID,

    CONSTRAINT "delivery_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_completions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_templates" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "module_id" UUID,
    "lesson_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "blueprint" JSONB NOT NULL,
    "blueprint_version" INTEGER NOT NULL DEFAULT 1,
    "status" "content_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assignment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "module_id" UUID,
    "lesson_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "assignment_status" NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMPTZ,
    "max_score" DECIMAL(8,2),
    "published_at" TIMESTAMPTZ,
    "source_template_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_items" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "item_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "marks" DECIMAL(6,2),
    "config" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assignment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_item_options" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assignment_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rubric_criteria" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_points" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "assignment_rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at_at_submission" TIMESTAMPTZ,
    "score" DECIMAL(8,2),
    "overall_feedback" TEXT,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_answers" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "answer_text" TEXT,
    "selected_option_id" UUID,
    "points_awarded" DECIMAL(6,2),

    CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_files" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_criterion_scores" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "points" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "submission_criterion_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_cleanup_queue" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "queued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ,

    CONSTRAINT "storage_cleanup_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_user_type_key" ON "roles"("id", "user_type");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_steamx_id_key" ON "users"("steamx_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_school_id_role_id_idx" ON "users"("school_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_school_id_user_type_key" ON "users"("id", "school_id", "user_type");

-- CreateIndex
CREATE INDEX "student_profiles_class_section_id_school_id_idx" ON "student_profiles"("class_section_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_school_id_key" ON "student_profiles"("user_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_school_id_user_type_key" ON "student_profiles"("user_id", "school_id", "user_type");

-- CreateIndex
CREATE INDEX "teacher_profiles_school_id_idx" ON "teacher_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_school_id_key" ON "teacher_profiles"("user_id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_school_id_user_type_key" ON "teacher_profiles"("user_id", "school_id", "user_type");

-- CreateIndex
CREATE UNIQUE INDEX "class_sections_id_school_id_key" ON "class_sections"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_id_course_id_key" ON "modules"("id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "modules_course_id_position_key" ON "modules"("course_id", "position");

-- CreateIndex
CREATE INDEX "lessons_course_id_idx" ON "lessons"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_id_course_id_key" ON "lessons"("id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_module_id_position_key" ON "lessons"("module_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "asset_files_storage_key_key" ON "asset_files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "asset_files_processing_job_id_key" ON "asset_files"("processing_job_id");

-- CreateIndex
CREATE INDEX "asset_files_asset_id_idx" ON "asset_files"("asset_id");

-- CreateIndex
CREATE INDEX "asset_files_status_idx" ON "asset_files"("status");

-- CreateIndex
CREATE INDEX "lesson_blocks_asset_id_idx" ON "lesson_blocks"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_blocks_id_lesson_id_key" ON "lesson_blocks"("id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_blocks_lesson_id_position_key" ON "lesson_blocks"("lesson_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_blocks_parent_block_id_column_index_key" ON "lesson_blocks"("parent_block_id", "column_index");

-- CreateIndex
CREATE INDEX "subscriptions_school_id_course_id_start_date_end_date_idx" ON "subscriptions"("school_id", "course_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "deliveries_school_id_course_id_status_idx" ON "deliveries"("school_id", "course_id", "status");

-- CreateIndex
CREATE INDEX "deliveries_class_section_id_idx" ON "deliveries"("class_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_id_school_id_key" ON "deliveries"("id", "school_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_id_school_id_course_id_key" ON "deliveries"("id", "school_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_class_section_id_course_id_academic_year_key" ON "deliveries"("class_section_id", "course_id", "academic_year");

-- CreateIndex
CREATE INDEX "delivery_teachers_delivery_id_idx" ON "delivery_teachers"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_teachers_teacher_id_removed_at_idx" ON "delivery_teachers"("teacher_id", "removed_at");

-- CreateIndex
CREATE INDEX "delivery_teachers_school_id_idx" ON "delivery_teachers"("school_id");

-- CreateIndex
CREATE INDEX "delivery_lesson_releases_lesson_id_idx" ON "delivery_lesson_releases"("lesson_id");

-- CreateIndex
CREATE INDEX "delivery_lesson_releases_school_id_idx" ON "delivery_lesson_releases"("school_id");

-- CreateIndex
CREATE INDEX "delivery_enrollments_student_id_status_idx" ON "delivery_enrollments"("student_id", "status");

-- CreateIndex
CREATE INDEX "delivery_enrollments_school_id_idx" ON "delivery_enrollments"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_enrollments_delivery_id_student_id_key" ON "delivery_enrollments"("delivery_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_enrollments_delivery_id_student_id_school_id_key" ON "delivery_enrollments"("delivery_id", "student_id", "school_id");

-- CreateIndex
CREATE INDEX "lesson_completions_lesson_id_idx" ON "lesson_completions"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_completions_school_id_idx" ON "lesson_completions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_completions_delivery_id_student_id_lesson_id_key" ON "lesson_completions"("delivery_id", "student_id", "lesson_id");

-- CreateIndex
CREATE INDEX "assignment_templates_course_id_idx" ON "assignment_templates"("course_id");

-- CreateIndex
CREATE INDEX "assignments_delivery_id_status_due_at_idx" ON "assignments"("delivery_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "assignments_lesson_id_idx" ON "assignments"("lesson_id");

-- CreateIndex
CREATE INDEX "assignments_module_id_idx" ON "assignments"("module_id");

-- CreateIndex
CREATE INDEX "assignments_school_id_idx" ON "assignments"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_id_delivery_id_key" ON "assignments"("id", "delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_items_id_assignment_id_key" ON "assignment_items"("id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_items_assignment_id_position_key" ON "assignment_items"("assignment_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_item_options_id_item_id_key" ON "assignment_item_options"("id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_item_options_item_id_position_key" ON "assignment_item_options"("item_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_rubric_criteria_id_assignment_id_key" ON "assignment_rubric_criteria"("id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_rubric_criteria_assignment_id_position_key" ON "assignment_rubric_criteria"("assignment_id", "position");

-- CreateIndex
CREATE INDEX "submissions_delivery_id_student_id_idx" ON "submissions"("delivery_id", "student_id");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_status_idx" ON "submissions"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "submissions_school_id_idx" ON "submissions"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_assignment_id_student_id_key" ON "submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_id_assignment_id_school_id_key" ON "submissions"("id", "assignment_id", "school_id");

-- CreateIndex
CREATE INDEX "submission_answers_school_id_idx" ON "submission_answers"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_answers_submission_id_item_id_key" ON "submission_answers"("submission_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_files_storage_key_key" ON "submission_files"("storage_key");

-- CreateIndex
CREATE INDEX "submission_files_submission_id_idx" ON "submission_files"("submission_id");

-- CreateIndex
CREATE INDEX "submission_files_school_id_idx" ON "submission_files"("school_id");

-- CreateIndex
CREATE INDEX "submission_criterion_scores_school_id_idx" ON "submission_criterion_scores"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_criterion_scores_submission_id_criterion_id_key" ON "submission_criterion_scores"("submission_id", "criterion_id");

-- CreateIndex
CREATE INDEX "storage_cleanup_queue_done_at_idx" ON "storage_cleanup_queue"("done_at");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_user_type_fkey" FOREIGN KEY ("role_id", "user_type") REFERENCES "roles"("id", "user_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_school_id_user_type_fkey" FOREIGN KEY ("user_id", "school_id", "user_type") REFERENCES "users"("id", "school_id", "user_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_class_section_id_school_id_fkey" FOREIGN KEY ("class_section_id", "school_id") REFERENCES "class_sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_school_id_user_type_fkey" FOREIGN KEY ("user_id", "school_id", "user_type") REFERENCES "users"("id", "school_id", "user_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_course_id_fkey" FOREIGN KEY ("module_id", "course_id") REFERENCES "modules"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_blocks" ADD CONSTRAINT "lesson_blocks_parent_block_id_lesson_id_fkey" FOREIGN KEY ("parent_block_id", "lesson_id") REFERENCES "lesson_blocks"("id", "lesson_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_class_section_id_school_id_fkey" FOREIGN KEY ("class_section_id", "school_id") REFERENCES "class_sections"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_teachers" ADD CONSTRAINT "delivery_teachers_delivery_id_school_id_fkey" FOREIGN KEY ("delivery_id", "school_id") REFERENCES "deliveries"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_teachers" ADD CONSTRAINT "delivery_teachers_teacher_id_school_id_fkey" FOREIGN KEY ("teacher_id", "school_id") REFERENCES "teacher_profiles"("user_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_teachers" ADD CONSTRAINT "delivery_teachers_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_teachers" ADD CONSTRAINT "delivery_teachers_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_lesson_releases" ADD CONSTRAINT "delivery_lesson_releases_delivery_id_school_id_course_id_fkey" FOREIGN KEY ("delivery_id", "school_id", "course_id") REFERENCES "deliveries"("id", "school_id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_lesson_releases" ADD CONSTRAINT "delivery_lesson_releases_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_lesson_releases" ADD CONSTRAINT "delivery_lesson_releases_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_enrollments" ADD CONSTRAINT "delivery_enrollments_delivery_id_school_id_fkey" FOREIGN KEY ("delivery_id", "school_id") REFERENCES "deliveries"("id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_enrollments" ADD CONSTRAINT "delivery_enrollments_student_id_school_id_fkey" FOREIGN KEY ("student_id", "school_id") REFERENCES "student_profiles"("user_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_enrollments" ADD CONSTRAINT "delivery_enrollments_enrolled_by_id_fkey" FOREIGN KEY ("enrolled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_enrollments" ADD CONSTRAINT "delivery_enrollments_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_delivery_id_student_id_school_id_fkey" FOREIGN KEY ("delivery_id", "student_id", "school_id") REFERENCES "delivery_enrollments"("delivery_id", "student_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_delivery_id_school_id_course_id_fkey" FOREIGN KEY ("delivery_id", "school_id", "course_id") REFERENCES "deliveries"("id", "school_id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_module_id_course_id_fkey" FOREIGN KEY ("module_id", "course_id") REFERENCES "modules"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_templates" ADD CONSTRAINT "assignment_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_delivery_id_school_id_course_id_fkey" FOREIGN KEY ("delivery_id", "school_id", "course_id") REFERENCES "deliveries"("id", "school_id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_module_id_course_id_fkey" FOREIGN KEY ("module_id", "course_id") REFERENCES "modules"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_course_id_fkey" FOREIGN KEY ("lesson_id", "course_id") REFERENCES "lessons"("id", "course_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "assignment_templates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_item_options" ADD CONSTRAINT "assignment_item_options_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "assignment_items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_rubric_criteria" ADD CONSTRAINT "assignment_rubric_criteria_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_delivery_id_fkey" FOREIGN KEY ("assignment_id", "delivery_id") REFERENCES "assignments"("id", "delivery_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_delivery_id_student_id_school_id_fkey" FOREIGN KEY ("delivery_id", "student_id", "school_id") REFERENCES "delivery_enrollments"("delivery_id", "student_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_assignment_id_school_id_fkey" FOREIGN KEY ("submission_id", "assignment_id", "school_id") REFERENCES "submissions"("id", "assignment_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_item_id_assignment_id_fkey" FOREIGN KEY ("item_id", "assignment_id") REFERENCES "assignment_items"("id", "assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_selected_option_id_item_id_fkey" FOREIGN KEY ("selected_option_id", "item_id") REFERENCES "assignment_item_options"("id", "item_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_assignment_id_school_id_fkey" FOREIGN KEY ("submission_id", "assignment_id", "school_id") REFERENCES "submissions"("id", "assignment_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_item_id_assignment_id_fkey" FOREIGN KEY ("item_id", "assignment_id") REFERENCES "assignment_items"("id", "assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_criterion_scores" ADD CONSTRAINT "submission_criterion_scores_submission_id_assignment_id_sc_fkey" FOREIGN KEY ("submission_id", "assignment_id", "school_id") REFERENCES "submissions"("id", "assignment_id", "school_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submission_criterion_scores" ADD CONSTRAINT "submission_criterion_scores_criterion_id_assignment_id_fkey" FOREIGN KEY ("criterion_id", "assignment_id") REFERENCES "assignment_rubric_criteria"("id", "assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
