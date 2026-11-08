import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

type Fixture = {
  schoolId: string;
  courseId: string;
  subscriptionId: string;
  deliveryId: string;
  studentId: string;
  assignmentId: string;
  moduleId: string;
  lessonId: string;
};

describe('assignment and submission database rules', () => {
  let client: Client;
  let db: RawDbContext;

  beforeEach(async () => {
    client = await connectRawClient();
    await client.query('BEGIN');
    db = createRawDbContext(client);
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  async function expectFailure(
    sql: string,
    values: unknown[] = [],
    code = '23000',
    constraint?: string,
  ): Promise<void> {
    await db.expectFailure(sql, values, { code, constraint });
  }

  async function createCourse(status = 'ACTIVE'): Promise<string> {
    const id = randomUUID();
    await client.query(
      'INSERT INTO courses (id, title, status, updated_at) VALUES ($1, $2, $3, now())',
      [id, `Course ${id}`, status],
    );
    return id;
  }

  async function createStudent(schoolId: string): Promise<string> {
    const sectionId = await db.createClassSection(schoolId);
    const id = await db.createUser({
      userType: 'STUDENT',
      roleKey: 'student',
      schoolId,
    });
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [id, schoolId, sectionId],
    );
    return id;
  }

  async function createFixture(): Promise<Fixture> {
    const schoolId = await db.createSchool();
    const courseId = await createCourse();
    const subscriptionId = randomUUID();
    await client.query(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, business_today(), business_today(), 5, now())`,
      [subscriptionId, schoolId, courseId],
    );

    const deliveryId = randomUUID();
    await client.query(
      `INSERT INTO deliveries
         (id, school_id, course_id, label, academic_year, status, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', 'ACTIVE', now())`,
      [deliveryId, schoolId, courseId, `Delivery ${deliveryId}`],
    );

    const studentId = await createStudent(schoolId);
    await client.query(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, studentId],
    );

    const moduleId = randomUUID();
    await client.query(
      `INSERT INTO modules (id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, 'Module', 1, 'ACTIVE', now())`,
      [moduleId, courseId],
    );
    const lessonId = randomUUID();
    await client.query(
      `INSERT INTO lessons
         (id, module_id, course_id, title, position, status, audience, updated_at)
       VALUES ($1, $2, $3, 'Lesson', 1, 'ACTIVE', 'STUDENT', now())`,
      [lessonId, moduleId, courseId],
    );

    const assignmentId = randomUUID();
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, module_id, title, due_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Assignment', now() + interval '1 day', now())`,
      [assignmentId, schoolId, deliveryId, courseId, moduleId],
    );

    return {
      schoolId,
      courseId,
      subscriptionId,
      deliveryId,
      studentId,
      assignmentId,
      moduleId,
      lessonId,
    };
  }

  async function createTemplate(courseId: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignment_templates
         (id, course_id, title, blueprint, updated_at)
       VALUES ($1, $2, 'Template', '{"items":[]}'::jsonb, now())`,
      [id, courseId],
    );
    return id;
  }

  async function createAssignmentFromTemplate(
    fixture: Fixture,
    templateId: string,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Template assignment', now() + interval '1 day', $5, now())`,
      [id, fixture.schoolId, fixture.deliveryId, fixture.courseId, templateId],
    );
    return id;
  }

  async function createItem(
    assignmentId: string,
    type: 'SINGLE_CHOICE' | 'TEXT' | 'FILE_UPLOAD' = 'TEXT',
    position = 1,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, $3, $4, 'Prompt', now())`,
      [id, assignmentId, position, type],
    );
    return id;
  }

  async function createOption(
    itemId: string,
    position: number,
    isCorrect = false,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignment_item_options (id, item_id, position, text, is_correct)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, itemId, position, `Option ${position}`, isCorrect],
    );
    return id;
  }

  async function publish(assignmentId: string): Promise<void> {
    await client.query(
      `UPDATE assignments
       SET status = 'PUBLISHED', published_at = COALESCE(published_at, now()), updated_at = now()
       WHERE id = $1`,
      [assignmentId],
    );
  }

  async function createSubmission(fixture: Fixture): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO submissions (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [id, fixture.schoolId, fixture.assignmentId, fixture.deliveryId, fixture.studentId],
    );
    return id;
  }

  async function insertAnswer(
    fixture: Fixture,
    submissionId: string,
    itemId: string,
    selectedOptionId: string | null,
    isCorrect: boolean | null,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO submission_answers
         (id, school_id, submission_id, assignment_id, item_id, selected_option_id, is_correct)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        itemId,
        selectedOptionId,
        isCorrect,
      ],
    );
    return id;
  }

  async function insertFile(
    fixture: Fixture,
    submissionId: string,
    itemId: string,
    storageKey = `submissions/${fixture.schoolId}/final/${randomUUID()}`,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 1)`,
      [id, fixture.schoolId, submissionId, fixture.assignmentId, itemId, storageKey],
    );
    return id;
  }

  it('enforces every assignment-template CHECK', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `INSERT INTO assignment_templates
         (id, course_id, module_id, lesson_id, title, blueprint, updated_at)
       VALUES ($1, $2, $3, $4, 'Template', '{"items":[]}'::jsonb, now())`,
      [randomUUID(), fixture.courseId, fixture.moduleId, fixture.lessonId],
      '23514',
      'assignment_templates_anchor',
    );
    await expectFailure(
      `INSERT INTO assignment_templates (id, course_id, title, blueprint, updated_at)
       VALUES ($1, $2, ' ', '{"items":[]}'::jsonb, now())`,
      [randomUUID(), fixture.courseId],
      '23514',
      'assignment_templates_title_nonempty',
    );
    await expectFailure(
      `INSERT INTO assignment_templates (id, course_id, title, blueprint, updated_at)
       VALUES ($1, $2, 'Template', '[]'::jsonb, now())`,
      [randomUUID(), fixture.courseId],
      '23514',
      'assignment_templates_blueprint_object',
    );
  });

  it('enforces every assignment CHECK', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `UPDATE assignments SET module_id = $1, lesson_id = $2 WHERE id = $3`,
      [fixture.moduleId, fixture.lessonId, fixture.assignmentId],
      '23514',
      'assignments_anchor',
    );
    await expectFailure(
      `UPDATE assignments SET title = ' ' WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_title_nonempty',
    );
    await expectFailure(
      `UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_draft_published_at',
    );
    await expectFailure(
      `UPDATE assignments SET published_at = now() WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_draft_published_at',
    );
    await expectFailure(
      `UPDATE assignments SET status = 'PUBLISHED', published_at = now(), due_at = NULL WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_due_at_required_when_published',
    );
    await expectFailure(
      `UPDATE assignments SET rubric = '{}'::jsonb WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_rubric_array',
    );

    await publish(fixture.assignmentId);
    await client.query(`UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('defaults assignments to disallow resubmission', async () => {
    const fixture = await createFixture();
    const result = await client.query('SELECT allow_resubmission FROM assignments WHERE id = $1', [
      fixture.assignmentId,
    ]);
    expect(result.rows[0].allow_resubmission).toBe(false);
  });

  it('enforces assignment-item and option CHECKs', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `INSERT INTO assignment_items
         (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 0, 'TEXT', 'Prompt', now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_position_positive',
    );
    await expectFailure(
      `INSERT INTO assignment_items
         (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 1, 'TEXT', ' ', now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_prompt_nonempty',
    );
    await expectFailure(
      `INSERT INTO assignment_items
         (id, assignment_id, position, type, prompt, config, updated_at)
       VALUES ($1, $2, 1, 'TEXT', 'Prompt', '[]'::jsonb, now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_config_object',
    );

    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 0, 'Option')`,
      [randomUUID(), itemId],
      '23514',
      'assignment_item_options_position_positive',
    );
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 1, ' ')`,
      [randomUUID(), itemId],
      '23514',
      'assignment_item_options_text_nonempty',
    );
  });

  it('enforces immediate item positions and both partial unique indexes', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 1, 'TEXT', 'Duplicate position', now())`,
      [randomUUID(), fixture.assignmentId],
      '23505',
      'assignment_items_assignment_id_position_key',
    );

    const templateId = await createTemplate(fixture.courseId);
    await createAssignmentFromTemplate(fixture, templateId);
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Duplicate', now() + interval '1 day', $5, now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId, templateId],
      '23505',
      'assignments_delivery_source_template_uq',
    );

    const choiceItem = await createItem(fixture.assignmentId, 'SINGLE_CHOICE', 2);
    await createOption(choiceItem, 1, true);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text, is_correct)
       VALUES ($1, $2, 2, 'Second correct', true)`,
      [randomUUID(), choiceItem],
      '23505',
      'assignment_item_options_one_correct_uq',
    );
  });

  it('rejects changes to immutable assignment identity columns', async () => {
    const fixture = await createFixture();
    const templateId = await createTemplate(fixture.courseId);
    const assignmentId = await createAssignmentFromTemplate(fixture, templateId);
    for (const column of ['delivery_id', 'school_id', 'course_id', 'source_template_id']) {
      await expectFailure(`UPDATE assignments SET ${column} = $1 WHERE id = $2`, [
        randomUUID(),
        assignmentId,
      ]);
    }
  });

  it('freezes assignment rubric and anchor after a submission while allowing published edits', async () => {
    const fixture = await createFixture();
    await publish(fixture.assignmentId);
    await createSubmission(fixture);

    await expectFailure(
      `UPDATE assignments SET rubric = '[{"name":"Rubric"}]'::jsonb WHERE id = $1`,
      [fixture.assignmentId],
    );
    await expectFailure(`UPDATE assignments SET module_id = NULL WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET lesson_id = $2 WHERE id = $1`, [
      fixture.assignmentId,
      fixture.lessonId,
    ]);

    await client.query(
      `UPDATE assignments
       SET title = 'Updated', due_at = now() + interval '2 days', allow_resubmission = true
       WHERE id = $1`,
      [fixture.assignmentId],
    );
    const result = await client.query(
      'SELECT title, allow_resubmission FROM assignments WHERE id = $1',
      [fixture.assignmentId],
    );
    expect(result.rows[0]).toEqual({ title: 'Updated', allow_resubmission: true });
  });

  it('requires unpublishing before editing rubric, anchor, items, or options', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    const optionId = await createOption(itemId, 1, true);
    await publish(fixture.assignmentId);

    await expectFailure(
      `UPDATE assignments SET rubric = '[{"name":"Rubric"}]'::jsonb WHERE id = $1`,
      [fixture.assignmentId],
    );
    await expectFailure(`UPDATE assignments SET module_id = NULL, lesson_id = $2 WHERE id = $1`, [
      fixture.assignmentId,
      fixture.lessonId,
    ]);
    await expectFailure(
      `INSERT INTO assignment_items
         (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 2, 'TEXT', 'New item', now())`,
      [randomUUID(), fixture.assignmentId],
    );
    await expectFailure(`UPDATE assignment_items SET prompt = 'Changed' WHERE id = $1`, [itemId]);
    await expectFailure(`DELETE FROM assignment_items WHERE id = $1`, [itemId]);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 2, 'New option')`,
      [randomUUID(), itemId],
    );
    await expectFailure(`UPDATE assignment_item_options SET text = 'Changed' WHERE id = $1`, [
      optionId,
    ]);
    await expectFailure(`DELETE FROM assignment_item_options WHERE id = $1`, [optionId]);

    await client.query(`UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await client.query(
      `UPDATE assignments
       SET rubric = '[{"name":"Rubric"}]'::jsonb, module_id = NULL, lesson_id = $2
       WHERE id = $1`,
      [fixture.assignmentId, fixture.lessonId],
    );
    await client.query(
      `UPDATE assignment_items SET prompt = 'Edited while unpublished' WHERE id = $1`,
      [itemId],
    );
    await client.query(
      `UPDATE assignment_item_options SET text = 'Edited while unpublished' WHERE id = $1`,
      [optionId],
    );
  });

  it('freezes item and option changes after a submission but permits purge deletes', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    const optionId = await createOption(itemId, 1);
    await publish(fixture.assignmentId);
    await createSubmission(fixture);

    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 2, 'TEXT', 'New item', now())`,
      [randomUUID(), fixture.assignmentId],
    );
    await expectFailure(`UPDATE assignment_items SET prompt = 'Changed' WHERE id = $1`, [itemId]);
    await expectFailure(`DELETE FROM assignment_items WHERE id = $1`, [itemId]);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 2, 'New option')`,
      [randomUUID(), itemId],
    );
    await expectFailure(`UPDATE assignment_item_options SET text = 'Changed' WHERE id = $1`, [
      optionId,
    ]);
    await expectFailure(`DELETE FROM assignment_item_options WHERE id = $1`, [optionId]);

    await client.query(`SET LOCAL steamx.purge = 'on'`);
    await client.query('DELETE FROM assignment_item_options WHERE id = $1', [optionId]);
    await client.query('DELETE FROM assignment_items WHERE id = $1', [itemId]);
  });

  it('rejects submission inserts for unpublished assignments, removed enrollment, or expired access', async () => {
    const unpublished = await createFixture();
    await expectFailure(
      `INSERT INTO submissions (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [
        randomUUID(),
        unpublished.schoolId,
        unpublished.assignmentId,
        unpublished.deliveryId,
        unpublished.studentId,
      ],
    );

    const removed = await createFixture();
    await publish(removed.assignmentId);
    await client.query(
      `UPDATE delivery_enrollments
       SET status = 'REMOVED', ended_at = now()
       WHERE delivery_id = $1 AND student_id = $2`,
      [removed.deliveryId, removed.studentId],
    );
    await expectFailure(
      `INSERT INTO submissions (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), removed.schoolId, removed.assignmentId, removed.deliveryId, removed.studentId],
    );

    const expired = await createFixture();
    await publish(expired.assignmentId);
    await client.query(
      `UPDATE subscriptions
       SET start_date = business_today() - 2, end_date = business_today() - 1
       WHERE id = $1`,
      [expired.subscriptionId],
    );
    await expectFailure(
      `INSERT INTO submissions (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), expired.schoolId, expired.assignmentId, expired.deliveryId, expired.studentId],
    );
  });

  it('sets submission timestamps from the assignment and enforces immutable identity', async () => {
    const fixture = await createFixture();
    await publish(fixture.assignmentId);
    const submissionId = randomUUID();
    const suppliedAt = '2000-01-01T00:00:00.000Z';
    await client.query(
      `INSERT INTO submissions
         (id, school_id, assignment_id, delivery_id, student_id, submitted_at,
          due_at_at_submission, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, now())`,
      [
        submissionId,
        fixture.schoolId,
        fixture.assignmentId,
        fixture.deliveryId,
        fixture.studentId,
        suppliedAt,
      ],
    );
    const timestamps = await client.query(
      `SELECT submitted_at, due_at_at_submission, a.due_at
       FROM submissions s JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [submissionId],
    );
    expect(timestamps.rows[0].submitted_at.getTime()).not.toBe(new Date(suppliedAt).getTime());
    expect(timestamps.rows[0].due_at_at_submission).toEqual(timestamps.rows[0].due_at);

    for (const column of ['assignment_id', 'delivery_id', 'student_id']) {
      await expectFailure(`UPDATE submissions SET ${column} = $1 WHERE id = $2`, [
        randomUUID(),
        submissionId,
      ]);
    }
  });

  it('guards resubmission updates and resets grading and timestamp values', async () => {
    const disabled = await createFixture();
    await publish(disabled.assignmentId);
    const disabledSubmission = await createSubmission(disabled);
    await expectFailure(`UPDATE submissions SET submitted_at = now() WHERE id = $1`, [
      disabledSubmission,
    ]);

    const fixture = await createFixture();
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await client.query(`UPDATE assignments SET allow_resubmission = true WHERE id = $1`, [
      fixture.assignmentId,
    ]);

    await expectFailure(
      `UPDATE submissions
       SET status = 'GRADED', submitted_at = now(), graded_at = now(), grade_percent = 75
       WHERE id = $1`,
      [submissionId],
    );

    await client.query(
      `UPDATE submissions
       SET status = 'GRADED', graded_at = now(), grade_percent = 75,
           rubric_levels = '["4"]'::jsonb, overall_feedback = 'Good work'
       WHERE id = $1`,
      [submissionId],
    );
    await client.query(
      `UPDATE submissions
       SET status = 'SUBMITTED', submitted_at = '2000-01-01T00:00:00Z',
           due_at_at_submission = '2000-01-01T00:00:00Z',
           graded_at = NULL, grade_percent = NULL, rubric_levels = NULL,
           overall_feedback = NULL, graded_by_id = NULL
       WHERE id = $1`,
      [submissionId],
    );

    const result = await client.query(
      `SELECT s.submitted_at, s.due_at_at_submission, s.status, s.graded_at,
              s.grade_percent, s.rubric_levels, s.overall_feedback, s.graded_by_id, a.due_at
       FROM submissions s JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [submissionId],
    );
    expect(result.rows[0].status).toBe('SUBMITTED');
    expect(result.rows[0].submitted_at.getTime()).not.toBe(
      new Date('2000-01-01T00:00:00Z').getTime(),
    );
    expect(result.rows[0].due_at_at_submission).toEqual(result.rows[0].due_at);
    expect(result.rows[0]).toMatchObject({
      graded_at: null,
      grade_percent: null,
      rubric_levels: null,
      overall_feedback: null,
      graded_by_id: null,
    });
  });

  it('rechecks published status, enrollment, and course access on resubmit', async () => {
    const unpublished = await createFixture();
    await publish(unpublished.assignmentId);
    const unpublishedSubmission = await createSubmission(unpublished);
    await client.query(
      `UPDATE assignments
       SET allow_resubmission = true, status = 'UNPUBLISHED'
       WHERE id = $1`,
      [unpublished.assignmentId],
    );
    await expectFailure(`UPDATE submissions SET submitted_at = now() WHERE id = $1`, [
      unpublishedSubmission,
    ]);

    const removed = await createFixture();
    await publish(removed.assignmentId);
    const removedSubmission = await createSubmission(removed);
    await client.query(`UPDATE assignments SET allow_resubmission = true WHERE id = $1`, [
      removed.assignmentId,
    ]);
    await client.query(
      `UPDATE delivery_enrollments SET status = 'REMOVED', ended_at = now()
       WHERE delivery_id = $1 AND student_id = $2`,
      [removed.deliveryId, removed.studentId],
    );
    await expectFailure(`UPDATE submissions SET submitted_at = now() WHERE id = $1`, [
      removedSubmission,
    ]);

    const expired = await createFixture();
    await publish(expired.assignmentId);
    const expiredSubmission = await createSubmission(expired);
    await client.query(`UPDATE assignments SET allow_resubmission = true WHERE id = $1`, [
      expired.assignmentId,
    ]);
    await client.query(
      `UPDATE subscriptions
       SET start_date = business_today() - 2, end_date = business_today() - 1
       WHERE id = $1`,
      [expired.subscriptionId],
    );
    await expectFailure(`UPDATE submissions SET submitted_at = now() WHERE id = $1`, [
      expiredSubmission,
    ]);
  });

  it('enforces every submission grading CHECK', async () => {
    const fixture = await createFixture();
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await expectFailure(
      `UPDATE submissions SET graded_at = now() WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_graded_at_matches_status',
    );
    await expectFailure(
      `UPDATE submissions SET grade_percent = 50 WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_grade_percent_matches_status',
    );
    await expectFailure(
      `UPDATE submissions SET status = 'GRADED', graded_at = now(), grade_percent = 101 WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_grade_percent_range',
    );
    await expectFailure(
      `UPDATE submissions SET rubric_levels = '{}'::jsonb WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_rubric_levels_array',
    );
    await expectFailure(
      `UPDATE submissions SET overall_feedback = 'Unexpected grade data' WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_ungraded_fields_null',
    );
  });

  it('computes answer correctness from the option and rejects answer updates', async () => {
    const fixture = await createFixture();
    const correctItem = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    const correctOption = await createOption(correctItem, 1, true);
    const wrongItem = await createItem(fixture.assignmentId, 'SINGLE_CHOICE', 2);
    const wrongOption = await createOption(wrongItem, 1);
    const emptyItem = await createItem(fixture.assignmentId, 'TEXT', 3);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    const correctAnswerId = await insertAnswer(
      fixture,
      submissionId,
      correctItem,
      correctOption,
      false,
    );
    const wrongAnswerId = await insertAnswer(fixture, submissionId, wrongItem, wrongOption, true);
    await insertAnswer(fixture, submissionId, emptyItem, null, true);

    const answers = await client.query(
      `SELECT item_id, is_correct FROM submission_answers
       WHERE submission_id = $1 ORDER BY item_id`,
      [submissionId],
    );
    expect(answers.rows.find((row) => row.item_id === correctItem).is_correct).toBe(true);
    expect(answers.rows.find((row) => row.item_id === wrongItem).is_correct).toBe(false);
    expect(answers.rows.find((row) => row.item_id === emptyItem).is_correct).toBeNull();
    await expectFailure(`UPDATE submission_answers SET is_correct = false WHERE id = $1`, [
      correctAnswerId,
    ]);
    await expectFailure(`UPDATE submission_answers SET selected_option_id = NULL WHERE id = $1`, [
      wrongAnswerId,
    ]);
  });

  it('enforces file checks and rejects file updates without enforcing item type', async () => {
    const fixture = await createFixture();
    const textItemId = await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await expectFailure(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 0)`,
      [
        randomUUID(),
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        textItemId,
        `submissions/${fixture.schoolId}/final/empty.pdf`,
      ],
      '23514',
      'submission_files_size_positive',
    );
    await expectFailure(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, 'wrong-school/key', 'file.pdf', 'application/pdf', 1)`,
      [randomUUID(), fixture.schoolId, submissionId, fixture.assignmentId, textItemId],
      '23514',
      'submission_files_storage_key_school_prefix',
    );

    const fileId = await insertFile(fixture, submissionId, textItemId);
    await expectFailure(`UPDATE submission_files SET filename = 'changed.pdf' WHERE id = $1`, [
      fileId,
    ]);
  });
});
