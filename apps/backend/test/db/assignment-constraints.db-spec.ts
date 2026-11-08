import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

type Fixture = {
  schoolId: string;
  courseId: string;
  subscriptionId: string;
  deliveryId: string;
  teacherId: string;
  studentId: string;
  assignmentId: string;
  moduleId: string;
  lessonId: string;
  enrollmentId: string;
};

type FixtureOptions = {
  assignTeacher?: boolean;
  deliveryStatus?: 'ACTIVE' | 'INACTIVE';
  enrollmentStatus?: 'ACTIVE' | 'REMOVED';
  lessonAudience?: 'STUDENT' | 'TEACHER_ONLY';
  assignmentLesson?: boolean;
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

  async function expectDeferredFailure(sql: string, values: unknown[] = []): Promise<void> {
    await client.query('SAVEPOINT expected_deferred_failure');
    let failure: unknown;
    try {
      await client.query(sql, values);
      await client.query('SET CONSTRAINTS trg_submissions_graded_by_scope IMMEDIATE');
    } catch (error) {
      failure = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT expected_deferred_failure');
    await client.query('RELEASE SAVEPOINT expected_deferred_failure');
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error) || !('code' in failure)) {
      throw new Error('PostgreSQL did not return the expected deferred-trigger error.');
    }
    expect((failure as Error & { code?: string }).code).toBe('23000');
    expect((failure as Error & { constraint?: string }).constraint).toBe(
      'trg_submissions_graded_by_scope',
    );
  }

  async function createCourse(status = 'ACTIVE'): Promise<string> {
    const id = randomUUID();
    await client.query(
      'INSERT INTO courses (id, title, status, updated_at) VALUES ($1, $2, $3, now())',
      [id, `Course ${id}`, status],
    );
    return id;
  }

  async function createTeacher(schoolId: string): Promise<string> {
    const id = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    await client.query(
      'INSERT INTO teacher_profiles (user_id, school_id, updated_at) VALUES ($1, $2, now())',
      [id, schoolId],
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

  async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
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
    const teacherId = await createTeacher(schoolId);
    if (options.assignTeacher !== false) {
      await client.query(
        `INSERT INTO delivery_teachers (id, school_id, delivery_id, teacher_id)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), schoolId, deliveryId, teacherId],
      );
    }

    const studentId = await createStudent(schoolId);
    const enrollmentId = randomUUID();
    await client.query(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [enrollmentId, schoolId, deliveryId, studentId],
    );
    if (options.enrollmentStatus === 'REMOVED') {
      await client.query(
        `UPDATE delivery_enrollments
         SET status = 'REMOVED', ended_at = now()
         WHERE id = $1`,
        [enrollmentId],
      );
    }
    if (options.deliveryStatus === 'INACTIVE') {
      await client.query(`UPDATE deliveries SET status = 'INACTIVE' WHERE id = $1`, [deliveryId]);
    }

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
       VALUES ($1, $2, $3, 'Lesson', 1, 'ACTIVE', $4, now())`,
      [lessonId, moduleId, courseId, options.lessonAudience ?? 'STUDENT'],
    );

    const assignmentId = randomUUID();
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, module_id, lesson_id, title, due_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Assignment', now() + interval '1 day', now())`,
      [
        assignmentId,
        schoolId,
        deliveryId,
        courseId,
        options.assignmentLesson ? null : moduleId,
        options.assignmentLesson ? lessonId : null,
      ],
    );

    return {
      schoolId,
      courseId,
      subscriptionId,
      deliveryId,
      teacherId,
      studentId,
      assignmentId,
      moduleId,
      lessonId,
      enrollmentId,
    };
  }

  async function createTemplate(
    courseId: string,
    options: {
      status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
      createdById?: string | null;
      moduleId?: string | null;
      lessonId?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignment_templates
         (id, course_id, module_id, lesson_id, title, blueprint, status, created_by_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Template', '{"items":[]}'::jsonb, $5, $6, now())`,
      [
        id,
        courseId,
        options.moduleId ?? null,
        options.lessonId ?? null,
        options.status ?? 'ACTIVE',
        options.createdById ?? null,
      ],
    );
    return id;
  }

  async function createAssignmentFromTemplate(
    fixture: Fixture,
    templateId: string,
    options: { moduleId?: string | null; lessonId?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, module_id, lesson_id, title, due_at,
          source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Template assignment', now() + interval '1 day', $7, now())`,
      [
        id,
        fixture.schoolId,
        fixture.deliveryId,
        fixture.courseId,
        options.moduleId ?? null,
        options.lessonId ?? null,
        templateId,
      ],
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
      `UPDATE assignments SET status = 'PUBLISHED', updated_at = now() WHERE id = $1`,
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
    answerText: string | null,
    selectedOptionId: string | null,
    isCorrect: boolean | null,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO submission_answers
         (id, school_id, submission_id, assignment_id, item_id, answer_text, selected_option_id, is_correct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        itemId,
        answerText,
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

  it('requires assignment templates to be created by platform staff', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `INSERT INTO assignment_templates
         (id, course_id, title, blueprint, status, created_by_id, updated_at)
       VALUES ($1, $2, 'Template', '{"items":[]}'::jsonb, 'ACTIVE', $3, now())`,
      [randomUUID(), fixture.courseId, fixture.teacherId],
    );
  });

  it('enforces template anchor, title, and blueprint checks', async () => {
    const fixture = await createFixture();
    const staffId = await db.createUser();
    await expectFailure(
      `INSERT INTO assignment_templates
         (id, course_id, module_id, lesson_id, title, blueprint, created_by_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Template', '{"items":[]}'::jsonb, $5, now())`,
      [randomUUID(), fixture.courseId, fixture.moduleId, fixture.lessonId, staffId],
      '23514',
      'assignment_templates_anchor',
    );
    await expectFailure(
      `INSERT INTO assignment_templates
         (id, course_id, title, blueprint, created_by_id, updated_at)
       VALUES ($1, $2, ' ', '{"items":[]}'::jsonb, $3, now())`,
      [randomUUID(), fixture.courseId, staffId],
      '23514',
      'assignment_templates_title_nonempty',
    );
    await expectFailure(
      `INSERT INTO assignment_templates
         (id, course_id, title, blueprint, created_by_id, updated_at)
       VALUES ($1, $2, 'Template', '[]'::jsonb, $3, now())`,
      [randomUUID(), fixture.courseId, staffId],
      '23514',
      'assignment_templates_blueprint_object',
    );
  });

  it('requires new assignments to start as DRAFT', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, status, due_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Assignment', 'PUBLISHED', now() + interval '1 day', now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId],
    );
  });

  it('rejects assignments copied from an inactive template', async () => {
    const fixture = await createFixture();
    const staffId = await db.createUser();
    const inactiveTemplate = await createTemplate(fixture.courseId, {
      status: 'DRAFT',
      createdById: staffId,
      moduleId: fixture.moduleId,
    });
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Assignment', now() + interval '1 day', $5, now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId, inactiveTemplate],
    );
  });

  it('rejects templates from another course and copies the anchor from a valid template', async () => {
    const fixture = await createFixture();
    const staffId = await db.createUser();
    const otherCourseId = await createCourse();
    const wrongCourseTemplate = await createTemplate(otherCourseId, {
      status: 'ACTIVE',
      createdById: staffId,
    });
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Assignment', now() + interval '1 day', $5, now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId, wrongCourseTemplate],
    );

    const anchoredTemplate = await createTemplate(fixture.courseId, {
      status: 'ACTIVE',
      createdById: staffId,
      moduleId: fixture.moduleId,
    });
    const assignmentId = await createAssignmentFromTemplate(fixture, anchoredTemplate, {
      lessonId: fixture.lessonId,
    });
    const result = await client.query(
      'SELECT module_id, lesson_id FROM assignments WHERE id = $1',
      [assignmentId],
    );
    expect(result.rows[0]).toEqual({
      module_id: fixture.moduleId,
      lesson_id: null,
    });
  });

  it('requires a non-platform assignment creator to be an active teacher of the delivery', async () => {
    const fixture = await createFixture();
    const otherTeacher = await createTeacher(fixture.schoolId);
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, created_by_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Assignment', now() + interval '1 day', $5, now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId, otherTeacher],
    );
  });

  it('accepts a creator who is an active teacher of the delivery', async () => {
    const fixture = await createFixture();
    const id = randomUUID();
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, created_by_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Teacher assignment', now() + interval '1 day', $5, now())`,
      [id, fixture.schoolId, fixture.deliveryId, fixture.courseId, fixture.teacherId],
    );
    const result = await client.query('SELECT created_by_id FROM assignments WHERE id = $1', [id]);
    expect(result.rows[0].created_by_id).toBe(fixture.teacherId);
  });

  it('enforces assignment anchor, title, rubric, and published due-date checks', async () => {
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
      `UPDATE assignments SET rubric = '{}'::jsonb WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_rubric_array',
    );
    await createItem(fixture.assignmentId);
    await client.query('UPDATE assignments SET due_at = NULL WHERE id = $1', [
      fixture.assignmentId,
    ]);
    await expectFailure(
      `UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`,
      [fixture.assignmentId],
      '23514',
      'assignments_due_at_required_when_published',
    );
  });

  it('permits only the specified status transitions and preserves the first published_at', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId);
    expect(itemId).toBeTruthy();

    await expectFailure(`UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);

    await publish(fixture.assignmentId);
    const firstPublishedAt = (
      await client.query('SELECT published_at FROM assignments WHERE id = $1', [
        fixture.assignmentId,
      ])
    ).rows[0].published_at;

    await client.query(`UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await client.query(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    const republishedAt = (
      await client.query('SELECT published_at FROM assignments WHERE id = $1', [
        fixture.assignmentId,
      ])
    ).rows[0].published_at;
    expect(republishedAt).toEqual(firstPublishedAt);

    await expectFailure(`UPDATE assignments SET status = 'DRAFT' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await client.query(`UPDATE assignments SET status = 'UNPUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET status = 'DRAFT' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(
      `UPDATE assignments SET published_at = now() + interval '1 day' WHERE id = $1`,
      [fixture.assignmentId],
    );
  });

  it('requires at least one item to publish', async () => {
    const fixture = await createFixture();
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('rejects publishing a mixture of SINGLE_CHOICE and non-choice items', async () => {
    const fixture = await createFixture();
    const choiceItem = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await createOption(choiceItem, 1, true);
    await createOption(choiceItem, 2);
    await createItem(fixture.assignmentId, 'TEXT', 2);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('requires every SINGLE_CHOICE item to have at least two options and one correct option', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await createOption(itemId, 1, true);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('requires exactly one correct option at publish', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await createOption(itemId, 1);
    await createOption(itemId, 2);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('allows at most one correct option per SINGLE_CHOICE item', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await createOption(itemId, 1, true);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text, is_correct)
       VALUES ($1, $2, 2, 'Second', true)`,
      [randomUUID(), itemId],
      '23505',
      'assignment_item_options_one_correct_uq',
    );
  });

  it('enforces immediate unique item positions', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 1, 'TEXT', 'Duplicate position', now())`,
      [randomUUID(), fixture.assignmentId],
      '23505',
      'assignment_items_assignment_id_position_key',
    );
  });

  it('allows only one assignment per delivery and source template', async () => {
    const fixture = await createFixture();
    const staffId = await db.createUser();
    const templateId = await createTemplate(fixture.courseId, { createdById: staffId });
    await createAssignmentFromTemplate(fixture, templateId);
    await expectFailure(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, due_at, source_template_id, updated_at)
       VALUES ($1, $2, $3, $4, 'Duplicate', now() + interval '1 day', $5, now())`,
      [randomUUID(), fixture.schoolId, fixture.deliveryId, fixture.courseId, templateId],
      '23505',
      'assignments_delivery_source_template_uq',
    );
  });

  it('rejects a rubric on a SINGLE_CHOICE assignment', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    await createOption(itemId, 1, true);
    await createOption(itemId, 2);
    await client.query(`UPDATE assignments SET rubric = '[]'::jsonb WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('rejects a TEACHER_ONLY lesson anchor on publish', async () => {
    const fixture = await createFixture({
      lessonAudience: 'TEACHER_ONLY',
      assignmentLesson: true,
    });
    await createItem(fixture.assignmentId);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      fixture.assignmentId,
    ]);
  });

  it('requires current course access and an ACTIVE delivery to publish', async () => {
    const expiredFixture = await createFixture();
    await createItem(expiredFixture.assignmentId);
    await client.query(
      `UPDATE subscriptions
       SET start_date = business_today() - 2, end_date = business_today() - 1
       WHERE id = $1`,
      [expiredFixture.subscriptionId],
    );
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      expiredFixture.assignmentId,
    ]);

    const inactiveFixture = await createFixture({ deliveryStatus: 'INACTIVE' });
    await createItem(inactiveFixture.assignmentId);
    await expectFailure(`UPDATE assignments SET status = 'PUBLISHED' WHERE id = $1`, [
      inactiveFixture.assignmentId,
    ]);
  });

  it('freezes assignment content after the first submission but allows the editable columns', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    await createSubmission(fixture);

    await client.query(
      `UPDATE assignments
       SET title = 'Renamed', description = 'Updated', due_at = now() + interval '2 days',
           allow_resubmission = false, status = 'UNPUBLISHED', updated_at = now()
       WHERE id = $1`,
      [fixture.assignmentId],
    );

    await expectFailure(`UPDATE assignments SET rubric = '[]'::jsonb WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET lesson_id = $1 WHERE id = $2`, [
      fixture.lessonId,
      fixture.assignmentId,
    ]);
  });

  it('keeps assignment delivery, school, course, and source template immutable', async () => {
    const fixture = await createFixture();
    const staffId = await db.createUser();
    const templateId = await createTemplate(fixture.courseId, { createdById: staffId });
    const assignmentId = await createAssignmentFromTemplate(fixture, templateId);
    await expectFailure(`UPDATE assignments SET source_template_id = NULL WHERE id = $1`, [
      assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET school_id = $1 WHERE id = $2`, [
      randomUUID(),
      assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET delivery_id = $1 WHERE id = $2`, [
      randomUUID(),
      assignmentId,
    ]);
    await expectFailure(`UPDATE assignments SET course_id = $1 WHERE id = $2`, [
      randomUUID(),
      assignmentId,
    ]);
  });

  it('enforces assignment item checks and freezes items and options after submission', async () => {
    const fixture = await createFixture();
    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 0, 'TEXT', 'Prompt', now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_position_positive',
    );
    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 1, 'TEXT', ' ', now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_prompt_nonempty',
    );
    await expectFailure(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, config, updated_at)
       VALUES ($1, $2, 1, 'TEXT', 'Prompt', '[]'::jsonb, now())`,
      [randomUUID(), fixture.assignmentId],
      '23514',
      'assignment_items_config_object',
    );

    const choiceItem = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    const correctOption = await createOption(choiceItem, 1, true);
    await createOption(choiceItem, 2);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 0, 'Option')`,
      [randomUUID(), choiceItem],
      '23514',
      'assignment_item_options_position_positive',
    );
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 3, ' ')`,
      [randomUUID(), choiceItem],
      '23514',
      'assignment_item_options_text_nonempty',
    );
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await expectFailure(`UPDATE assignment_items SET prompt = 'Changed' WHERE id = $1`, [
      choiceItem,
    ]);
    await expectFailure(`DELETE FROM assignment_items WHERE id = $1`, [choiceItem]);
    await expectFailure(`DELETE FROM assignment_item_options WHERE id = $1`, [correctOption]);
    await expectFailure(`UPDATE assignment_item_options SET text = 'Changed' WHERE id = $1`, [
      correctOption,
    ]);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 3, 'Option')`,
      [randomUUID(), choiceItem],
    );
    await client.query(`SET LOCAL steamx.purge = 'on'`);
    await client.query('DELETE FROM assignment_item_options WHERE item_id = $1', [choiceItem]);
    await client.query('DELETE FROM assignment_items WHERE id = $1', [choiceItem]);
    expect(submissionId).toBeTruthy();
  });

  it('allows options only for SINGLE_CHOICE parents', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId);
    await expectFailure(
      `INSERT INTO assignment_item_options (id, item_id, position, text)
       VALUES ($1, $2, 1, 'Option')`,
      [randomUUID(), itemId],
    );
  });

  it('requires published assignments, active enrollments, and course access for submissions', async () => {
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
    await createItem(removed.assignmentId);
    await publish(removed.assignmentId);
    await client.query(
      `UPDATE delivery_enrollments
       SET status = 'REMOVED', ended_at = now()
       WHERE id = $1`,
      [removed.enrollmentId],
    );
    await expectFailure(
      `INSERT INTO submissions (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [randomUUID(), removed.schoolId, removed.assignmentId, removed.deliveryId, removed.studentId],
    );

    const expired = await createFixture();
    await createItem(expired.assignmentId);
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

  it('sets submission timestamps from the assignment and discards client grading data on insert', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const id = randomUUID();
    await client.query(
      `INSERT INTO submissions
         (id, school_id, assignment_id, delivery_id, student_id, submitted_at,
          due_at_at_submission, status, grade_percent, rubric_levels, overall_feedback, graded_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now() - interval '1 year', now() - interval '1 year',
               'SUBMITTED', 99, '[]'::jsonb, 'ignored', now(), now())`,
      [id, fixture.schoolId, fixture.assignmentId, fixture.deliveryId, fixture.studentId],
    );
    const result = await client.query(
      `SELECT submitted_at = now() AS submitted_now,
              due_at_at_submission = a.due_at AS due_matches,
              s.status, s.grade_percent, s.rubric_levels, s.overall_feedback, s.graded_at
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [id],
    );
    expect(result.rows[0]).toEqual({
      submitted_now: true,
      due_matches: true,
      status: 'SUBMITTED',
      grade_percent: null,
      rubric_levels: null,
      overall_feedback: null,
      graded_at: null,
    });
  });

  it('allows resubmission after grading and clears all grading fields', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await client.query(
      `UPDATE submissions
       SET status = 'GRADED', grade_percent = 87.5, rubric_levels = '["4"]'::jsonb,
           overall_feedback = 'Good', graded_at = now(), graded_by_id = $2
       WHERE id = $1`,
      [submissionId, fixture.teacherId],
    );
    await client.query(
      `UPDATE submissions
       SET submitted_at = clock_timestamp(), due_at_at_submission = now() - interval '1 year'
       WHERE id = $1`,
      [submissionId],
    );
    const result = await client.query(
      `SELECT s.status, s.submitted_at = now() AS submitted_now,
              s.due_at_at_submission = a.due_at AS due_matches,
              s.grade_percent, s.rubric_levels, s.overall_feedback, s.graded_by_id, s.graded_at
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [submissionId],
    );
    expect(result.rows[0]).toEqual({
      status: 'SUBMITTED',
      submitted_now: true,
      due_matches: true,
      grade_percent: null,
      rubric_levels: null,
      overall_feedback: null,
      graded_by_id: null,
      graded_at: null,
    });
  });

  it('blocks resubmission when the assignment disallows it and blocks changing only the due snapshot', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await client.query(`UPDATE assignments SET allow_resubmission = false WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(`UPDATE submissions SET submitted_at = clock_timestamp() WHERE id = $1`, [
      submissionId,
    ]);

    await client.query(`UPDATE assignments SET allow_resubmission = true WHERE id = $1`, [
      fixture.assignmentId,
    ]);
    await expectFailure(
      `UPDATE submissions
       SET due_at_at_submission = now() + interval '3 days'
       WHERE id = $1`,
      [submissionId],
    );
  });

  it('allows plain grading updates but enforces grading checks', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    await client.query(
      `UPDATE submissions
       SET status = 'GRADED', grade_percent = 100, rubric_levels = '[]'::jsonb,
           overall_feedback = 'Done', graded_at = now()
       WHERE id = $1`,
      [submissionId],
    );
    await expectFailure(
      `UPDATE submissions SET grade_percent = 101 WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_grade_percent_range',
    );
    await expectFailure(
      `UPDATE submissions SET grade_percent = NULL WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_grade_percent_matches_status',
    );
    await expectFailure(
      `UPDATE submissions SET rubric_levels = '{}'::jsonb WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_rubric_levels_array',
    );
    await expectFailure(
      `UPDATE submissions SET status = 'SUBMITTED', grade_percent = NULL WHERE id = $1`,
      [submissionId],
      '23514',
      'submissions_graded_at_matches_status',
    );
  });

  it('keeps submission identity immutable and rejects non-grading updates', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    await expectFailure(`UPDATE submissions SET assignment_id = $1 WHERE id = $2`, [
      randomUUID(),
      submissionId,
    ]);
    await expectFailure(
      `UPDATE submissions SET created_at = now() + interval '1 day' WHERE id = $1`,
      [submissionId],
    );
  });

  it('requires the graded_by actor to be in school scope and an active delivery teacher', async () => {
    const fixture = await createFixture();
    await createItem(fixture.assignmentId);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    const otherSchoolId = await db.createSchool();
    const otherSchoolTeacherId = await createTeacher(otherSchoolId);
    await expectDeferredFailure(
      `UPDATE submissions
       SET status = 'GRADED', grade_percent = 80, graded_at = now(), graded_by_id = $1
       WHERE id = $2`,
      [otherSchoolTeacherId, submissionId],
    );

    await expectDeferredFailure(
      `UPDATE submissions
       SET status = 'GRADED', grade_percent = 80, graded_at = now(), graded_by_id = $1
       WHERE id = $2`,
      [fixture.studentId, submissionId],
    );
  });

  it('enforces answer shape and computes correctness from the selected option', async () => {
    const fixture = await createFixture();
    const itemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE');
    const correctOption = await createOption(itemId, 1, true);
    await createOption(itemId, 2);
    const secondItemId = await createItem(fixture.assignmentId, 'SINGLE_CHOICE', 2);
    await createOption(secondItemId, 1, true);
    const wrongOption = await createOption(secondItemId, 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    await expectFailure(
      `INSERT INTO submission_answers
         (id, school_id, submission_id, assignment_id, item_id, answer_text)
       VALUES ($1, $2, $3, $4, $5, 'Answer')`,
      [randomUUID(), fixture.schoolId, submissionId, fixture.assignmentId, itemId],
    );

    const answerId = await insertAnswer(fixture, submissionId, itemId, null, correctOption, false);
    const correctResult = await client.query(
      'SELECT is_correct FROM submission_answers WHERE id = $1',
      [answerId],
    );
    expect(correctResult.rows[0].is_correct).toBe(true);

    const wrongAnswerId = await insertAnswer(
      fixture,
      submissionId,
      secondItemId,
      null,
      wrongOption,
      true,
    );
    const wrongResult = await client.query(
      'SELECT is_correct FROM submission_answers WHERE id = $1',
      [wrongAnswerId],
    );
    expect(wrongResult.rows[0].is_correct).toBe(false);
  });

  it('accepts TEXT answer shape, rejects FILE_UPLOAD answers, and rejects answer updates', async () => {
    const fixture = await createFixture();
    const textItem = await createItem(fixture.assignmentId, 'TEXT');
    const fileItem = await createItem(fixture.assignmentId, 'FILE_UPLOAD', 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    const answerId = await insertAnswer(fixture, submissionId, textItem, 'Response', null, true);
    const result = await client.query('SELECT is_correct FROM submission_answers WHERE id = $1', [
      answerId,
    ]);
    expect(result.rows[0].is_correct).toBeNull();

    await expectFailure(
      `INSERT INTO submission_answers
         (id, school_id, submission_id, assignment_id, item_id, answer_text)
       VALUES ($1, $2, $3, $4, $5, 'Response')`,
      [randomUUID(), fixture.schoolId, submissionId, fixture.assignmentId, fileItem],
    );
    await expectFailure(`UPDATE submission_answers SET answer_text = 'Changed' WHERE id = $1`, [
      answerId,
    ]);
  });

  it('accepts only positive-sized files attached to FILE_UPLOAD items with the final school key', async () => {
    const fixture = await createFixture();
    const fileItem = await createItem(fixture.assignmentId, 'FILE_UPLOAD');
    const textItem = await createItem(fixture.assignmentId, 'TEXT', 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    await expectFailure(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 1)`,
      [
        randomUUID(),
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        textItem,
        `submissions/${fixture.schoolId}/final/wrong-type`,
      ],
    );
    await expectFailure(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 1)`,
      [
        randomUUID(),
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        fileItem,
        `submissions/${randomUUID()}/final/wrong-school`,
      ],
      '23514',
      'submission_files_storage_key_school_prefix',
    );
    await expectFailure(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 0)`,
      [
        randomUUID(),
        fixture.schoolId,
        submissionId,
        fixture.assignmentId,
        fileItem,
        `submissions/${fixture.schoolId}/final/zero`,
      ],
      '23514',
      'submission_files_size_positive',
    );

    const fileId = await insertFile(fixture, submissionId, fileItem);
    await expectFailure(`UPDATE submission_files SET filename = 'changed.pdf' WHERE id = $1`, [
      fileId,
    ]);
  });

  it('allows answer and file children inside the submit transaction', async () => {
    const fixture = await createFixture();
    const textItem = await createItem(fixture.assignmentId, 'TEXT');
    const fileItem = await createItem(fixture.assignmentId, 'FILE_UPLOAD', 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);

    const answerId = await insertAnswer(fixture, submissionId, textItem, 'Response', null, null);
    const fileId = await insertFile(fixture, submissionId, fileItem);
    expect(answerId).toBeTruthy();
    expect(fileId).toBeTruthy();
  });

  it('allows child deletes during purge', async () => {
    const fixture = await createFixture();
    const textItem = await createItem(fixture.assignmentId, 'TEXT');
    const fileItem = await createItem(fixture.assignmentId, 'FILE_UPLOAD', 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    await insertAnswer(fixture, submissionId, textItem, 'Response', null, null);
    await insertFile(fixture, submissionId, fileItem);
    await client.query(`SET LOCAL steamx.purge = 'on'`);
    await client.query('DELETE FROM submission_answers WHERE submission_id = $1', [submissionId]);
    await client.query('DELETE FROM submission_files WHERE submission_id = $1', [submissionId]);
  });

  it('rejects answer and file child writes outside the submit transaction', async () => {
    const fixture = await createFixture();
    const textItem = await createItem(fixture.assignmentId, 'TEXT');
    const fileItem = await createItem(fixture.assignmentId, 'FILE_UPLOAD', 2);
    await publish(fixture.assignmentId);
    const submissionId = await createSubmission(fixture);
    const answerId = await insertAnswer(
      fixture,
      submissionId,
      textItem,
      'Before commit',
      null,
      null,
    );
    const fileKey = `submissions/${fixture.schoolId}/final/outside-${randomUUID()}`;
    const fileId = await insertFile(fixture, submissionId, fileItem, fileKey);

    await client.query('COMMIT');
    await client.query('BEGIN');
    try {
      await expectFailure(
        `INSERT INTO submission_answers
           (id, school_id, submission_id, assignment_id, item_id, answer_text)
         VALUES ($1, $2, $3, $4, $5, 'Late')`,
        [randomUUID(), fixture.schoolId, submissionId, fixture.assignmentId, textItem],
      );
      await expectFailure(
        `INSERT INTO submission_files
           (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, 'file.pdf', 'application/pdf', 1)`,
        [
          randomUUID(),
          fixture.schoolId,
          submissionId,
          fixture.assignmentId,
          fileItem,
          `submissions/${fixture.schoolId}/final/late`,
        ],
      );
      await expectFailure('DELETE FROM submission_answers WHERE id = $1', [answerId]);
      await expectFailure('DELETE FROM submission_files WHERE id = $1', [fileId]);
    } finally {
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`SET LOCAL steamx.purge = 'on'`);
      await client.query('DELETE FROM submission_answers WHERE id = $1', [answerId]);
      await client.query('DELETE FROM submission_files WHERE id = $1', [fileId]);
      await client.query('DELETE FROM storage_cleanup_queue WHERE object_key = $1', [fileKey]);
      await client.query('DELETE FROM submissions WHERE id = $1', [submissionId]);
      await client.query('DELETE FROM assignment_items WHERE assignment_id = $1', [
        fixture.assignmentId,
      ]);
      await client.query('DELETE FROM assignments WHERE id = $1', [fixture.assignmentId]);
      await client.query('DELETE FROM delivery_enrollments WHERE id = $1', [fixture.enrollmentId]);
      await client.query('DELETE FROM delivery_teachers WHERE delivery_id = $1', [
        fixture.deliveryId,
      ]);
      await client.query('DELETE FROM deliveries WHERE id = $1', [fixture.deliveryId]);
      await client.query('DELETE FROM subscriptions WHERE id = $1', [fixture.subscriptionId]);
      await client.query('DELETE FROM lessons WHERE id = $1', [fixture.lessonId]);
      await client.query('DELETE FROM modules WHERE id = $1', [fixture.moduleId]);
      await client.query('DELETE FROM student_profiles WHERE user_id = $1', [fixture.studentId]);
      await client.query('DELETE FROM teacher_profiles WHERE user_id = $1', [fixture.teacherId]);
      await client.query('DELETE FROM class_sections WHERE school_id = $1', [fixture.schoolId]);
      await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
        [fixture.studentId, fixture.teacherId],
      ]);
      await client.query('DELETE FROM courses WHERE id = $1', [fixture.courseId]);
      await client.query('DELETE FROM schools WHERE id = $1', [fixture.schoolId]);
      await client.query('COMMIT');
      await client.query('BEGIN');
    }
  });
});
