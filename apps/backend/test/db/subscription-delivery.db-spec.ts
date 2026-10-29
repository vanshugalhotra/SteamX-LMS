import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext, type RawDbContext } from '../support/raw-db-context.js';

type PgFailure = Error & {
  code?: string;
  constraint?: string;
};

type SubscriptionOptions = {
  startDate?: string;
  endDate?: string;
  maxDeliveries?: number;
};

describe('subscription and delivery database rules', () => {
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

  async function createCourse(status = 'ACTIVE'): Promise<string> {
    const id = randomUUID();
    await client.query(
      'INSERT INTO courses (id, title, status, updated_at) VALUES ($1, $2, $3, now())',
      [id, `Course ${id}`, status],
    );
    return id;
  }

  async function createSubscription(
    schoolId: string,
    courseId: string,
    options: SubscriptionOptions = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, coalesce($4::date, business_today()),
               coalesce($5::date, business_today()), $6, now())`,
      [
        id,
        schoolId,
        courseId,
        options.startDate ?? null,
        options.endDate ?? null,
        options.maxDeliveries ?? 1,
      ],
    );
    return id;
  }

  async function createDelivery(
    schoolId: string,
    courseId: string,
    classSectionId: string,
    options: { status?: 'ACTIVE' | 'INACTIVE'; academicYear?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        id,
        schoolId,
        courseId,
        classSectionId,
        options.academicYear ?? '2026-27',
        options.status ?? 'ACTIVE',
      ],
    );
    return id;
  }

  async function expectFailure(
    sql: string,
    values: unknown[],
    code: string,
    constraint: string,
  ): Promise<void> {
    await db.expectFailure(sql, values, { code, constraint });
  }

  async function createStudent(
    schoolId: string,
    classSectionId: string,
    status = 'ACTIVE',
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO users
         (id, steamx_id, name, password_hash, role_id, user_type, school_id, status, updated_at)
       SELECT $1, $2, 'Test Student', 'test-hash', id, 'STUDENT', $3, $4, now()
       FROM roles WHERE key = 'student'`,
      [id, `T${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`, schoolId, status],
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [id, schoolId, classSectionId],
    );
    return id;
  }

  async function createModule(
    courseId: string,
    status: 'ACTIVE' | 'DRAFT' = 'ACTIVE',
    position = 1,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO modules (id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, 'Test Module', $3, $4, now())`,
      [id, courseId, position, status],
    );
    return id;
  }

  async function createLesson(
    moduleId: string,
    courseId: string,
    options: {
      status?: 'ACTIVE' | 'DRAFT';
      audience?: 'STUDENT' | 'TEACHER_ONLY';
      position?: number;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO lessons
         (id, module_id, course_id, title, position, status, audience, updated_at)
       VALUES ($1, $2, $3, 'Test Lesson', $4, $5, $6, now())`,
      [
        id,
        moduleId,
        courseId,
        options.position ?? 1,
        options.status ?? 'ACTIVE',
        options.audience ?? 'STUDENT',
      ],
    );
    return id;
  }

  it('checks subscription access inclusively by date and isolates schools', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const courseId = await createCourse();
    await createSubscription(schoolId, courseId, {
      startDate: '2026-01-10',
      endDate: '2026-01-20',
    });

    const result = await client.query(
      `SELECT has_course_access($1, $2, '2026-01-10') AS start_day,
              has_course_access($1, $2, '2026-01-20') AS end_day,
              has_course_access($1, $2, '2026-01-09') AS before_start,
              has_course_access($1, $2, '2026-01-21') AS after_end,
              has_course_access($3, $2, '2026-01-15') AS other_school`,
      [schoolId, courseId, otherSchoolId],
    );

    expect(result.rows[0]).toEqual({
      start_day: true,
      end_day: true,
      before_start: false,
      after_end: false,
      other_school: false,
    });
  });

  it('defers overlapping subscription rejection until commit and accepts adjacent or isolated terms', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const courseId = await createCourse();
    const otherCourseId = await createCourse();
    await createSubscription(schoolId, courseId, {
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    await createSubscription(schoolId, courseId, {
      startDate: '2026-01-11',
      endDate: '2026-01-20',
    });
    await createSubscription(schoolId, otherCourseId, {
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    await createSubscription(otherSchoolId, courseId, {
      startDate: '2026-01-01',
      endDate: '2026-01-10',
    });
    await client.query('COMMIT');
    await client.query('BEGIN');
    await createSubscription(schoolId, courseId, {
      startDate: '2026-01-05',
      endDate: '2026-01-15',
    });

    let failure: unknown;
    try {
      await client.query('COMMIT');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error) || !('code' in failure)) {
      throw new Error('COMMIT did not return the expected deferred exclusion error.');
    }
    const pgFailure = failure as PgFailure;
    expect({ code: pgFailure.code, constraint: pgFailure.constraint }).toEqual({
      code: '23P01',
      constraint: 'subscriptions_school_course_no_overlap',
    });
    await client.query('BEGIN');
  });

  it('rejects invalid subscription date and delivery-cap checks', async () => {
    const schoolId = await db.createSchool();
    const courseId = await createCourse();

    await expectFailure(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, '2026-01-02', '2026-01-01', 1, now())`,
      [randomUUID(), schoolId, courseId],
      '23514',
      'subscriptions_end_date_order',
    );
    await expectFailure(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, '2026-01-01', '2026-01-02', 0, now())`,
      [randomUUID(), schoolId, courseId],
      '23514',
      'subscriptions_max_deliveries_positive',
    );
  });

  it('protects subscription identity and requires an ACTIVE course', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const courseId = await createCourse();
    const otherCourseId = await createCourse();
    const subscriptionId = await createSubscription(schoolId, courseId);

    await expectFailure(
      'UPDATE subscriptions SET school_id = $1 WHERE id = $2',
      [otherSchoolId, subscriptionId],
      '23000',
      'trg_subscriptions_immutable_identity',
    );
    await expectFailure(
      'UPDATE subscriptions SET course_id = $1 WHERE id = $2',
      [otherCourseId, subscriptionId],
      '23000',
      'trg_subscriptions_immutable_identity',
    );
    for (const status of ['DRAFT', 'ARCHIVED']) {
      const inactiveCourseId = await createCourse(status);
      await expectFailure(
        `INSERT INTO subscriptions
           (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
         VALUES ($1, $2, $3, business_today(), business_today(), 1, now())`,
        [randomUUID(), schoolId, inactiveCourseId],
        '23000',
        'trg_subscriptions_require_active_course',
      );
    }
  });

  it('enforces the delivery limit for inserts, reactivation, and missing subscriptions', async () => {
    const schoolId = await db.createSchool();
    const sectionOne = await db.createClassSection(schoolId);
    const sectionTwo = await db.createClassSection(schoolId, 'Class 6');
    const courseId = await createCourse();
    await createSubscription(schoolId, courseId, { maxDeliveries: 1 });
    await createDelivery(schoolId, courseId, sectionOne);

    await expectFailure(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', now())`,
      [randomUUID(), schoolId, courseId, sectionTwo],
      '23000',
      'trg_deliveries_require_active_subscription',
    );

    const secondCourseId = await createCourse();
    await createSubscription(schoolId, secondCourseId, { maxDeliveries: 1 });
    const thirdSection = await db.createClassSection(schoolId, 'Class 7');
    const firstInactiveDeliveryId = await createDelivery(schoolId, secondCourseId, sectionOne, {
      status: 'INACTIVE',
    });
    const secondInactiveDeliveryId = await createDelivery(schoolId, secondCourseId, thirdSection, {
      status: 'INACTIVE',
    });
    await client.query(
      `UPDATE deliveries SET status = 'ACTIVE', updated_at = now() WHERE id = $1`,
      [firstInactiveDeliveryId],
    );
    await expectFailure(
      `UPDATE deliveries SET status = 'ACTIVE', updated_at = now()
       WHERE id = $1`,
      [secondInactiveDeliveryId],
      '23000',
      'trg_deliveries_require_active_subscription',
    );

    const noSubscriptionCourseId = await createCourse();
    await expectFailure(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', now())`,
      [randomUUID(), schoolId, noSubscriptionCourseId, sectionTwo],
      '23000',
      'trg_deliveries_require_active_subscription',
    );
  });

  it('serializes concurrent delivery creation for the final subscription slot', async () => {
    const setupClient = await connectRawClient();
    const firstClient = await connectRawClient();
    const secondClient = await connectRawClient();
    const courseId = randomUUID();
    const raceSchoolId = randomUUID();
    const sectionIds = [randomUUID(), randomUUID()];
    const deliveryIds = [randomUUID(), randomUUID()];

    try {
      await setupClient.query(
        `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
         VALUES ($1, $2, 'Cap Race School', 'Test City', 'State', '00000', 'Country', now())`,
        [raceSchoolId, `R${randomUUID().replaceAll('-', '').slice(0, 11).toUpperCase()}`],
      );

      await setupClient.query(
        `INSERT INTO courses (id, title, status, updated_at)
         VALUES ($1, 'Cap race course', 'ACTIVE', now())`,
        [courseId],
      );
      for (const sectionId of sectionIds) {
        await setupClient.query(
          `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
           VALUES ($1, $2, $3, 'A', now())`,
          [sectionId, raceSchoolId, `Race ${sectionId.slice(0, 8)}`],
        );
      }
      await setupClient.query(
        `INSERT INTO subscriptions
           (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
         VALUES ($1, $2, $3, business_today(), business_today(), 1, now())`,
        [randomUUID(), raceSchoolId, courseId],
      );

      async function attemptDelivery(raceClient: Client, index: number): Promise<boolean> {
        await raceClient.query('BEGIN');
        try {
          await raceClient.query(
            `INSERT INTO deliveries
               (id, school_id, course_id, class_section_id, academic_year, updated_at)
             VALUES ($1, $2, $3, $4, '2026-27', now())`,
            [deliveryIds[index], raceSchoolId, courseId, sectionIds[index]],
          );
          await raceClient.query('COMMIT');
          return true;
        } catch (error) {
          await raceClient.query('ROLLBACK');
          if (error instanceof Error && 'code' in error && error.code === '23000') {
            return false;
          }
          throw error;
        }
      }

      const results = await Promise.all([
        attemptDelivery(firstClient, 0),
        attemptDelivery(secondClient, 1),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    } finally {
      await firstClient.end();
      await secondClient.end();
      const cleanup = await connectRawClient();
      try {
        await cleanup.query('DELETE FROM deliveries WHERE id = ANY($1::uuid[])', [deliveryIds]);
        await cleanup.query('DELETE FROM subscriptions WHERE course_id = $1', [courseId]);
        await cleanup.query('DELETE FROM class_sections WHERE id = ANY($1::uuid[])', [sectionIds]);
        await cleanup.query('DELETE FROM schools WHERE id = $1', [raceSchoolId]);
        await cleanup.query('DELETE FROM courses WHERE id = $1', [courseId]);
      } finally {
        await cleanup.end();
        await setupClient.end();
      }
    }
  });

  it('rejects lowering a subscription cap below its active delivery count', async () => {
    const schoolId = await db.createSchool();
    const sectionOne = await db.createClassSection(schoolId);
    const sectionTwo = await db.createClassSection(schoolId, 'Class 6');
    const courseId = await createCourse();
    const subscriptionId = await createSubscription(schoolId, courseId, { maxDeliveries: 2 });
    await createDelivery(schoolId, courseId, sectionOne);
    await createDelivery(schoolId, courseId, sectionTwo);

    await expectFailure(
      'UPDATE subscriptions SET max_deliveries = 1 WHERE id = $1',
      [subscriptionId],
      '23000',
      'trg_subscriptions_guard_max_deliveries',
    );
  });

  it('protects delivery identity and validates academic-year format', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const otherSectionId = await db.createClassSection(otherSchoolId);
    const courseId = await createCourse();
    const otherCourseId = await createCourse();
    await createSubscription(schoolId, courseId, { maxDeliveries: 2 });
    const deliveryId = await createDelivery(schoolId, courseId, sectionId);

    await expectFailure(
      'UPDATE deliveries SET school_id = $1 WHERE id = $2',
      [otherSchoolId, deliveryId],
      '23000',
      'trg_deliveries_immutable_identity',
    );
    await expectFailure(
      'UPDATE deliveries SET course_id = $1 WHERE id = $2',
      [otherCourseId, deliveryId],
      '23000',
      'trg_deliveries_immutable_identity',
    );
    await expectFailure(
      'UPDATE deliveries SET class_section_id = $1 WHERE id = $2',
      [otherSectionId, deliveryId],
      '23000',
      'trg_deliveries_immutable_identity',
    );
    await expectFailure(
      'UPDATE deliveries SET academic_year = $1 WHERE id = $2',
      ['2026-2027', deliveryId],
      '23000',
      'trg_deliveries_immutable_identity',
    );
    await expectFailure(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '26-27', now())`,
      [randomUUID(), schoolId, courseId, sectionId],
      '23514',
      'deliveries_academic_year_fmt',
    );
  });

  it('checks enrollment class placement on insert and reactivation', async () => {
    const schoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const otherSectionId = await db.createClassSection(schoolId, 'Class 6');
    const courseId = await createCourse();
    await createSubscription(schoolId, courseId);
    const deliveryId = await createDelivery(schoolId, courseId, sectionId);
    const studentId = await createStudent(schoolId, otherSectionId);

    await expectFailure(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, studentId],
      '23000',
      'trg_delivery_enrollments_validate',
    );

    const matchingStudentId = await createStudent(schoolId, sectionId);
    await client.query(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, matchingStudentId],
    );

    const reactivatingStudentId = await createStudent(schoolId, sectionId);
    const enrollmentId = randomUUID();
    await client.query(
      `INSERT INTO delivery_enrollments
         (id, school_id, delivery_id, student_id, status, enrolled_at, ended_at)
       VALUES ($1, $2, $3, $4, 'COMPLETED', now() - interval '1 day', now())`,
      [enrollmentId, schoolId, deliveryId, reactivatingStudentId],
    );
    await client.query('UPDATE student_profiles SET class_section_id = $1 WHERE user_id = $2', [
      otherSectionId,
      reactivatingStudentId,
    ]);
    await expectFailure(
      `UPDATE delivery_enrollments
       SET status = 'ACTIVE', ended_at = NULL
       WHERE id = $1`,
      [enrollmentId],
      '23000',
      'trg_delivery_enrollments_validate',
    );
  });

  it('keeps enrollment identity immutable after creation', async () => {
    const schoolId = await db.createSchool();
    const otherSchoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const courseId = await createCourse();
    await createSubscription(schoolId, courseId, { maxDeliveries: 2 });
    const deliveryId = await createDelivery(schoolId, courseId, sectionId);
    const secondDeliveryId = await createDelivery(
      schoolId,
      courseId,
      await db.createClassSection(schoolId, 'Class 6'),
      { status: 'INACTIVE' },
    );
    const studentId = await createStudent(schoolId, sectionId);
    const otherStudentId = await createStudent(schoolId, sectionId);
    const enrollmentId = randomUUID();
    await client.query(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [enrollmentId, schoolId, deliveryId, studentId],
    );

    await expectFailure(
      'UPDATE delivery_enrollments SET school_id = $1 WHERE id = $2',
      [otherSchoolId, enrollmentId],
      '23000',
      'trg_delivery_enrollments_immutable_identity',
    );
    await expectFailure(
      'UPDATE delivery_enrollments SET delivery_id = $1 WHERE id = $2',
      [secondDeliveryId, enrollmentId],
      '23000',
      'trg_delivery_enrollments_immutable_identity',
    );
    await expectFailure(
      'UPDATE delivery_enrollments SET student_id = $1 WHERE id = $2',
      [otherStudentId, enrollmentId],
      '23000',
      'trg_delivery_enrollments_immutable_identity',
    );
  });

  it('checks release lesson and module eligibility', async () => {
    const schoolId = await db.createSchool();
    const sectionId = await db.createClassSection(schoolId);
    const courseId = await createCourse();
    await createSubscription(schoolId, courseId);
    const deliveryId = await createDelivery(schoolId, courseId, sectionId);
    const activeModuleId = await createModule(courseId);
    const draftLessonId = await createLesson(activeModuleId, courseId, {
      status: 'DRAFT',
      position: 1,
    });
    const teacherOnlyLessonId = await createLesson(activeModuleId, courseId, {
      audience: 'TEACHER_ONLY',
      position: 2,
    });
    const validLessonId = await createLesson(activeModuleId, courseId, { position: 3 });
    const nonActiveModuleId = await createModule(courseId, 'DRAFT', 2);
    const nonActiveModuleLessonId = await createLesson(nonActiveModuleId, courseId, {
      status: 'DRAFT',
    });

    for (const lessonId of [draftLessonId, teacherOnlyLessonId, nonActiveModuleLessonId]) {
      await expectFailure(
        `INSERT INTO delivery_lesson_releases
           (delivery_id, lesson_id, school_id, course_id)
         VALUES ($1, $2, $3, $4)`,
        [deliveryId, lessonId, schoolId, courseId],
        '23000',
        'trg_delivery_lesson_releases_validate',
      );
    }
    await client.query(
      `INSERT INTO delivery_lesson_releases
         (delivery_id, lesson_id, school_id, course_id)
       VALUES ($1, $2, $3, $4)`,
      [deliveryId, validLessonId, schoolId, courseId],
    );

    const otherCourseId = await createCourse();
    await createSubscription(schoolId, otherCourseId);
    const otherDeliveryId = await createDelivery(schoolId, otherCourseId, sectionId, {
      status: 'INACTIVE',
    });
    const otherModuleId = await createModule(otherCourseId);
    const otherLessonId = await createLesson(otherModuleId, otherCourseId);
    const releaseId = {
      deliveryId,
      lessonId: validLessonId,
    };
    const identityUpdates: { sql: string; value: string }[] = [
      { sql: 'school_id = $1', value: await db.createSchool() },
      { sql: 'course_id = $1', value: otherCourseId },
      { sql: 'delivery_id = $1', value: otherDeliveryId },
      { sql: 'lesson_id = $1', value: otherLessonId },
    ];
    for (const { sql, value } of identityUpdates) {
      await expectFailure(
        `UPDATE delivery_lesson_releases SET ${sql}
         WHERE delivery_id = $2 AND lesson_id = $3`,
        [value, releaseId.deliveryId, releaseId.lessonId],
        '23000',
        'trg_delivery_lesson_releases_immutable_identity',
      );
    }
  });
});
