import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';
import { createRawDbContext } from '../support/raw-db-context.js';

describe('delivery teacher database rules', () => {
  let client: Client;

  beforeEach(async () => {
    client = await connectRawClient();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  it('rejects a second active assignment but accepts one after removal', async () => {
    const db = createRawDbContext(client);
    const schoolId = await db.createSchool();
    const courseId = randomUUID();
    const classSectionId = await db.createClassSection(schoolId);
    const teacherId = await db.createUser({
      userType: 'SCHOOL_STAFF',
      roleKey: 'teacher',
      schoolId,
    });
    const deliveryId = randomUUID();

    await client.query(
      'INSERT INTO courses (id, title, status, updated_at) VALUES ($1, $2, $3, now())',
      [courseId, `Delivery teacher test ${courseId}`, 'ACTIVE'],
    );
    await client.query(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, business_today(), business_today(), 1, now())`,
      [randomUUID(), schoolId, courseId],
    );
    await client.query(
      `INSERT INTO teacher_profiles (user_id, school_id, updated_at)
       VALUES ($1, $2, now())`,
      [teacherId, schoolId],
    );
    await client.query(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, status, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', 'ACTIVE', now())`,
      [deliveryId, schoolId, courseId, classSectionId],
    );

    const firstAssignmentId = randomUUID();
    await client.query(
      `INSERT INTO delivery_teachers (id, school_id, delivery_id, teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [firstAssignmentId, schoolId, deliveryId, teacherId],
    );
    await db.expectFailure(
      `INSERT INTO delivery_teachers (id, school_id, delivery_id, teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, teacherId],
      { code: '23505', constraint: 'delivery_teacher_active_unique' },
    );

    await client.query('UPDATE delivery_teachers SET removed_at = now() WHERE id = $1', [
      firstAssignmentId,
    ]);
    await client.query(
      `INSERT INTO delivery_teachers (id, school_id, delivery_id, teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, teacherId],
    );

    const counts = await client.query<{ total: string; active: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE removed_at IS NULL) AS active
       FROM delivery_teachers
       WHERE delivery_id = $1`,
      [deliveryId],
    );
    expect(counts.rows[0]).toEqual({ total: '2', active: '1' });
  });
});
