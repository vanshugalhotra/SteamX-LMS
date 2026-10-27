import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { connectRawClient } from '../support/raw-sql.js';

type ExpectedPgFailure = {
  code: string;
  name: string;
};

type PgFailure = Error & {
  code?: string;
  constraint?: string;
};

describe('curriculum and asset database rules', () => {
  let client: Client;

  beforeEach(async () => {
    client = await connectRawClient();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    await client.end();
  });

  async function expectPgFailure(
    sql: string,
    values: unknown[],
    expected: ExpectedPgFailure,
  ): Promise<void> {
    await client.query('SAVEPOINT expected_failure');
    let failure: unknown;
    try {
      await client.query(sql, values);
    } catch (error) {
      failure = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT expected_failure');
    await client.query('RELEASE SAVEPOINT expected_failure');
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error) || !('code' in failure)) {
      throw new Error('PostgreSQL did not return the expected database error.');
    }
    const pgFailure = failure as PgFailure;
    expect({ code: pgFailure.code, name: pgFailure.constraint }).toEqual(expected);
  }

  async function createCourse(status = 'DRAFT', title = 'Course'): Promise<string> {
    const id = randomUUID();
    await client.query(
      'INSERT INTO courses (id, title, status, updated_at) VALUES ($1, $2, $3, now())',
      [id, title, status],
    );
    return id;
  }

  async function createModule(
    courseId: string,
    options: { status?: string; position?: number; title?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO modules (id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [id, courseId, options.title ?? 'Module', options.position ?? 1, options.status ?? 'DRAFT'],
    );
    return id;
  }

  async function createLesson(
    moduleId: string,
    courseId: string,
    options: { status?: string; position?: number; title?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO lessons (id, module_id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        id,
        moduleId,
        courseId,
        options.title ?? 'Lesson',
        options.position ?? 1,
        options.status ?? 'DRAFT',
      ],
    );
    return id;
  }

  async function createAsset(type = 'IMAGE', title = 'Asset'): Promise<string> {
    const id = randomUUID();
    await client.query(
      'INSERT INTO assets (id, type, title, updated_at) VALUES ($1, $2, $3, now())',
      [id, type, title],
    );
    return id;
  }

  async function createBlock(
    lessonId: string,
    options: {
      type?: string;
      content?: unknown;
      assetId?: string | null;
      position?: number | null;
      parentId?: string | null;
      columnIndex?: number | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, content, asset_id, position, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, now())`,
      [
        id,
        lessonId,
        options.type ?? 'RICH_TEXT',
        JSON.stringify(options.content ?? {}),
        options.assetId ?? null,
        options.position === undefined ? 1 : options.position,
        options.parentId ?? null,
        options.columnIndex ?? null,
      ],
    );
    return id;
  }

  async function createAssetFile(
    assetId: string,
    options: {
      id?: string;
      status?: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
      playbackKey?: string | null;
    } = {},
  ): Promise<string> {
    const id = options.id ?? randomUUID();
    const prefix = `assets/${assetId}/${id}/`;
    const requestedStatus = options.status ?? 'UPLOADING';
    await client.query(
      `INSERT INTO asset_files
         (id, asset_id, storage_key, mime_type, size_bytes, playback_key, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        id,
        assetId,
        `${prefix}original`,
        options.mimeType === undefined ? 'image/png' : options.mimeType,
        options.sizeBytes === undefined ? 1 : options.sizeBytes,
        options.playbackKey === undefined ? null : options.playbackKey,
      ],
    );

    if (
      requestedStatus === 'UPLOADED' ||
      requestedStatus === 'PROCESSING' ||
      requestedStatus === 'READY'
    ) {
      await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [id]);
    }
    if (requestedStatus === 'PROCESSING' || requestedStatus === 'READY') {
      await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [id]);
    }
    if (requestedStatus === 'READY' || requestedStatus === 'FAILED') {
      await client.query('UPDATE asset_files SET status = $1 WHERE id = $2', [requestedStatus, id]);
    }
    return id;
  }

  it.each([
    {
      name: 'course title at nonblank boundary',
      good: async () => createCourse('DRAFT', ' x '),
      bad: () =>
        expectPgFailure(
          `INSERT INTO courses (id, title, updated_at) VALUES ($1, ' ', now())`,
          [randomUUID()],
          { code: '23514', name: 'courses_title_nonempty' },
        ),
    },
    {
      name: 'module title and first position',
      good: async () => {
        const course = await createCourse();
        return createModule(course, { title: ' x ', position: 1 });
      },
      bad: async () => {
        const course = await createCourse();
        return expectPgFailure(
          `INSERT INTO modules (id, course_id, title, position, updated_at)
           VALUES ($1, $2, ' ', 1, now())`,
          [randomUUID(), course],
          { code: '23514', name: 'modules_title_nonempty' },
        );
      },
    },
    {
      name: 'module position lower bound',
      good: async () => {
        const course = await createCourse();
        return createModule(course, { position: 1 });
      },
      bad: async () => {
        const course = await createCourse();
        return expectPgFailure(
          `INSERT INTO modules (id, course_id, title, position, updated_at)
           VALUES ($1, $2, 'Module', 0, now())`,
          [randomUUID(), course],
          { code: '23514', name: 'modules_position_positive' },
        );
      },
    },
    {
      name: 'lesson title and first position',
      good: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        return createLesson(module, course, { title: ' x ', position: 1 });
      },
      bad: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        return expectPgFailure(
          `INSERT INTO lessons (id, module_id, course_id, title, position, updated_at)
           VALUES ($1, $2, $3, ' ', 1, now())`,
          [randomUUID(), module, course],
          { code: '23514', name: 'lessons_title_nonempty' },
        );
      },
    },
    {
      name: 'lesson position lower bound',
      good: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        return createLesson(module, course, { position: 1 });
      },
      bad: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        return expectPgFailure(
          `INSERT INTO lessons (id, module_id, course_id, title, position, updated_at)
           VALUES ($1, $2, $3, 'Lesson', 0, now())`,
          [randomUUID(), module, course],
          { code: '23514', name: 'lessons_position_positive' },
        );
      },
    },
    {
      name: 'asset title',
      good: async () => createAsset('IMAGE', ' x '),
      bad: () =>
        expectPgFailure(
          `INSERT INTO assets (id, type, title, updated_at) VALUES ($1, 'IMAGE', ' ', now())`,
          [randomUUID()],
          { code: '23514', name: 'assets_title_nonempty' },
        ),
    },
    {
      name: 'block position lower bound',
      good: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        const lesson = await createLesson(module, course);
        return createBlock(lesson, { position: 1 });
      },
      bad: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        const lesson = await createLesson(module, course);
        return expectPgFailure(
          `INSERT INTO lesson_blocks (id, lesson_id, type, position, updated_at)
           VALUES ($1, $2, 'RICH_TEXT', 0, now())`,
          [randomUUID(), lesson],
          { code: '23514', name: 'lesson_blocks_position_positive' },
        );
      },
    },
    {
      name: 'file size null or one byte',
      good: async () => {
        const asset = await createAsset();
        await createAssetFile(asset, { sizeBytes: null });
        return createAssetFile(asset, { sizeBytes: 1 });
      },
      bad: async () => {
        const asset = await createAsset();
        const id = randomUUID();
        return expectPgFailure(
          `INSERT INTO asset_files (id, asset_id, storage_key, size_bytes, updated_at)
           VALUES ($1, $2, $3, 0, now())`,
          [id, asset, `assets/${asset}/${id}/original`],
          { code: '23514', name: 'asset_files_size_positive' },
        );
      },
    },
  ])('checks $name and accepts its valid boundary', async ({ good, bad }) => {
    await good();
    await bad();
  });

  it('defaults content_version to zero, accepts nonnegative values, and rejects negative values', async () => {
    const courseId = await createCourse();
    const moduleId = await createModule(courseId);
    const lessonId = await createLesson(moduleId, courseId);
    const defaultVersion = await client.query<{ content_version: number }>(
      'SELECT content_version FROM lessons WHERE id = $1',
      [lessonId],
    );
    expect(defaultVersion.rows[0]?.content_version).toBe(0);

    await client.query('UPDATE lessons SET content_version = 0 WHERE id = $1', [lessonId]);
    await client.query('UPDATE lessons SET content_version = 7 WHERE id = $1', [lessonId]);
    await expectPgFailure('UPDATE lessons SET content_version = -1 WHERE id = $1', [lessonId], {
      code: '23514',
      name: 'lessons_content_version_nonneg',
    });
  });

  it('reorders positions through an unused value and replaces two-column children in one transaction', async () => {
    const course = await createCourse();
    const firstModule = await createModule(course, { position: 1 });
    const secondModule = await createModule(course, { position: 2 });
    const firstLesson = await createLesson(firstModule, course, { position: 1 });
    const secondLesson = await createLesson(firstModule, course, { position: 2 });
    const firstBlock = await createBlock(firstLesson, { position: 1 });
    const secondBlock = await createBlock(firstLesson, { position: 2 });
    const layout = await createBlock(secondLesson, { type: 'TWO_COLUMN' });
    await createBlock(secondLesson, {
      parentId: layout,
      position: null,
      columnIndex: 0,
    });
    await createBlock(secondLesson, {
      parentId: layout,
      position: null,
      columnIndex: 1,
    });

    await client.query('UPDATE modules SET position = 3 WHERE id = $1', [firstModule]);
    await client.query('UPDATE modules SET position = 1 WHERE id = $1', [secondModule]);
    await client.query('UPDATE modules SET position = 2 WHERE id = $1', [firstModule]);
    await client.query('UPDATE lessons SET position = 3 WHERE id = $1', [firstLesson]);
    await client.query('UPDATE lessons SET position = 1 WHERE id = $1', [secondLesson]);
    await client.query('UPDATE lessons SET position = 2 WHERE id = $1', [firstLesson]);
    await client.query('UPDATE lesson_blocks SET position = 3 WHERE id = $1', [firstBlock]);
    await client.query('UPDATE lesson_blocks SET position = 1 WHERE id = $1', [secondBlock]);
    await client.query('UPDATE lesson_blocks SET position = 2 WHERE id = $1', [firstBlock]);
    await client.query('DELETE FROM lesson_blocks WHERE parent_block_id = $1', [layout]);
    await createBlock(secondLesson, {
      parentId: layout,
      position: null,
      columnIndex: 1,
    });
    await createBlock(secondLesson, {
      parentId: layout,
      position: null,
      columnIndex: 0,
    });

    const count = await client.query(
      `SELECT count(*)::int AS count FROM lesson_blocks WHERE parent_block_id = $1`,
      [layout],
    );
    expect(count.rows[0]?.count).toBe(2);
  });

  it.each([
    {
      table: 'modules',
      constraint: 'modules_course_id_position_key',
      create: async () => {
        const course = await createCourse();
        await createModule(course);
        await expectPgFailure(
          `INSERT INTO modules (id, course_id, title, position, updated_at)
           VALUES ($1, $2, 'Duplicate', 1, now())`,
          [randomUUID(), course],
          { code: '23505', name: 'modules_course_id_position_key' },
        );
      },
    },
    {
      table: 'lessons',
      constraint: 'lessons_module_id_position_key',
      create: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        await createLesson(module, course);
        await expectPgFailure(
          `INSERT INTO lessons (id, module_id, course_id, title, position, updated_at)
           VALUES ($1, $2, $3, 'Duplicate', 1, now())`,
          [randomUUID(), module, course],
          { code: '23505', name: 'lessons_module_id_position_key' },
        );
      },
    },
    {
      table: 'lesson_blocks',
      constraint: 'lesson_blocks_lesson_id_position_key',
      create: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        const lesson = await createLesson(module, course);
        await createBlock(lesson);
        await expectPgFailure(
          `INSERT INTO lesson_blocks (id, lesson_id, type, position, updated_at)
           VALUES ($1, $2, 'RICH_TEXT', 1, now())`,
          [randomUUID(), lesson],
          { code: '23505', name: 'lesson_blocks_lesson_id_position_key' },
        );
      },
    },
    {
      table: 'lesson_blocks',
      constraint: 'lesson_blocks_parent_block_id_column_index_key',
      create: async () => {
        const course = await createCourse();
        const module = await createModule(course);
        const lesson = await createLesson(module, course);
        const parent = await createBlock(lesson, { type: 'TWO_COLUMN' });
        await createBlock(lesson, { parentId: parent, position: null, columnIndex: 0 });
        await expectPgFailure(
          `INSERT INTO lesson_blocks
             (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
           VALUES ($1, $2, 'RICH_TEXT', NULL, $3, 0, now())`,
          [randomUUID(), lesson, parent],
          { code: '23505', name: 'lesson_blocks_parent_block_id_column_index_key' },
        );
      },
    },
  ])('rejects duplicate $table keys immediately', async ({ create }) => {
    await create();
  });

  it('requires active parents to activate modules and lessons and rejects active lesson moves into drafts', async () => {
    const draftCourse = await createCourse();
    await expectPgFailure(
      `INSERT INTO modules (id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, 'Module', 1, 'ACTIVE', now())`,
      [randomUUID(), draftCourse],
      { code: '23000', name: 'trg_modules_require_active_course' },
    );

    const activeCourse = await createCourse('ACTIVE');
    const draftModule = await createModule(activeCourse);
    const otherDraftModule = await createModule(activeCourse, { position: 2 });
    await expectPgFailure(
      `INSERT INTO lessons (id, module_id, course_id, title, position, status, updated_at)
       VALUES ($1, $2, $3, 'Lesson', 1, 'ACTIVE', now())`,
      [randomUUID(), draftModule, activeCourse],
      { code: '23000', name: 'trg_lessons_require_active_module' },
    );

    const activeModule = await createModule(activeCourse, { status: 'ACTIVE', position: 3 });
    const lesson = await createLesson(activeModule, activeCourse, { status: 'ACTIVE' });
    await expectPgFailure(
      `UPDATE lessons SET module_id = $1 WHERE id = $2`,
      [draftModule, lesson],
      { code: '23000', name: 'trg_lessons_require_active_module' },
    );
    await client.query(`UPDATE modules SET status = 'ACTIVE' WHERE id = $1`, [draftModule]);
    await client.query(`UPDATE lessons SET module_id = $1 WHERE id = $2`, [draftModule, lesson]);
    await client.query(`UPDATE modules SET status = 'ACTIVE' WHERE id = $1`, [otherDraftModule]);
  });

  it('cascades archive to active descendants only, does not revive children, and blocks return to draft', async () => {
    const course = await createCourse('ACTIVE');
    const activeModule = await createModule(course, { status: 'ACTIVE' });
    const draftModule = await createModule(course, { position: 2 });
    const activeLesson = await createLesson(activeModule, course, { status: 'ACTIVE' });
    const draftLesson = await createLesson(activeModule, course, { position: 2 });

    await client.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [course]);
    await client.query(`UPDATE courses SET status = 'ACTIVE' WHERE id = $1`, [course]);
    const states = await client.query(
      `SELECT c.status AS course, m.status AS active_module, dm.status AS draft_module,
              l.status AS active_lesson, dl.status AS draft_lesson
       FROM courses c
       JOIN modules m ON m.id = $2
       JOIN modules dm ON dm.id = $3
       JOIN lessons l ON l.id = $4
       JOIN lessons dl ON dl.id = $5
       WHERE c.id = $1`,
      [course, activeModule, draftModule, activeLesson, draftLesson],
    );
    expect(states.rows[0]).toEqual({
      course: 'ACTIVE',
      active_module: 'ARCHIVED',
      draft_module: 'DRAFT',
      active_lesson: 'ARCHIVED',
      draft_lesson: 'DRAFT',
    });

    await expectPgFailure(`UPDATE courses SET status = 'DRAFT' WHERE id = $1`, [course], {
      code: '23000',
      name: 'trg_courses_no_return_to_draft',
    });
    await expectPgFailure(`UPDATE modules SET status = 'DRAFT' WHERE id = $1`, [activeModule], {
      code: '23000',
      name: 'trg_modules_no_return_to_draft',
    });
    await expectPgFailure(`UPDATE lessons SET status = 'DRAFT' WHERE id = $1`, [activeLesson], {
      code: '23000',
      name: 'trg_lessons_no_return_to_draft',
    });
    await client.query(`UPDATE modules SET status = 'ACTIVE' WHERE id = $1`, [activeModule]);
    await client.query(`UPDATE lessons SET status = 'ACTIVE' WHERE id = $1`, [activeLesson]);
  });

  it('allows draft content to be archived and active/archived content to transition without returning to draft', async () => {
    const course = await createCourse();
    await client.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [course]);
    await client.query(`UPDATE courses SET status = 'ACTIVE' WHERE id = $1`, [course]);
    await client.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [course]);
    const status = await client.query('SELECT status FROM courses WHERE id = $1', [course]);
    expect(status.rows[0]?.status).toBe('ARCHIVED');
  });

  it('requires active subscription courses and rejects deliveries for archived courses', async () => {
    const schoolId = randomUUID();
    const sectionId = randomUUID();
    await client.query(
      `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
       VALUES ($1, $2, 'Test School', 'Test City', 'State', '00000', 'Country', now())`,
      [schoolId, `T${randomUUID().slice(0, 10).toUpperCase()}`],
    );
    await client.query(
      `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
       VALUES ($1, $2, 'Class 5', 'A', now())`,
      [sectionId, schoolId],
    );
    const activeCourse = await createCourse('ACTIVE');
    const archivedCourse = await createCourse('ARCHIVED');
    const draftCourse = await createCourse('DRAFT');

    const subscriptionId = randomUUID();
    await client.query(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, 1, now())`,
      [subscriptionId, schoolId, activeCourse],
    );
    const activeDeliveryId = randomUUID();
    await client.query(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', now())`,
      [activeDeliveryId, schoolId, activeCourse, sectionId],
    );
    await client.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [activeCourse]);
    const runningDelivery = await client.query(
      `SELECT d.status AS delivery_status, c.status AS course_status,
              s.id AS subscription_id
       FROM deliveries d
       JOIN courses c ON c.id = d.course_id
       JOIN subscriptions s ON s.course_id = c.id AND s.school_id = d.school_id
       WHERE d.id = $1`,
      [activeDeliveryId],
    );
    expect(runningDelivery.rows).toEqual([
      {
        delivery_status: 'ACTIVE',
        course_status: 'ARCHIVED',
        subscription_id: subscriptionId,
      },
    ]);
    await expectPgFailure(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, 1, now())`,
      [randomUUID(), schoolId, archivedCourse],
      { code: '23000', name: 'trg_subscriptions_require_active_course' },
    );
    await expectPgFailure(
      `INSERT INTO subscriptions
         (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE, 1, now())`,
      [randomUUID(), schoolId, draftCourse],
      { code: '23000', name: 'trg_subscriptions_require_active_course' },
    );
    await expectPgFailure(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', now())`,
      [randomUUID(), schoolId, archivedCourse, sectionId],
      { code: '23000', name: 'trg_deliveries_reject_archived_course' },
    );
  });

  it('serializes child activation with concurrent parent archival', async () => {
    const otherClient = await connectRawClient();
    try {
      const course = await createCourse('ACTIVE');
      const module = await createModule(course);
      await client.query('COMMIT');
      await client.query('BEGIN');
      const firstPid = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const secondPid = await otherClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');

      await client.query(`UPDATE modules SET status = 'ACTIVE' WHERE id = $1`, [module]);
      await otherClient.query('BEGIN');
      const archive = otherClient.query(`UPDATE courses SET status = 'ARCHIVED' WHERE id = $1`, [
        course,
      ]);

      let isBlocked = false;
      for (let attempt = 0; attempt < 10000 && !isBlocked; attempt += 1) {
        const blockers = await client.query<{ blocked: boolean }>(
          'SELECT $1 = ANY(pg_blocking_pids($2)) AS blocked',
          [firstPid.rows[0]?.pid, secondPid.rows[0]?.pid],
        );
        isBlocked = blockers.rows[0]?.blocked ?? false;
        if (!isBlocked) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      expect(isBlocked).toBe(true);

      await client.query('COMMIT');
      await archive;
      await otherClient.query('COMMIT');
      const finalState = await otherClient.query(
        `SELECT c.status AS course, m.status AS module
         FROM courses c JOIN modules m ON m.course_id = c.id WHERE c.id = $1`,
        [course],
      );
      expect(finalState.rows[0]).toEqual({ course: 'ARCHIVED', module: 'ARCHIVED' });
    } finally {
      await otherClient.query('ROLLBACK');
      await otherClient.end();
    }
  });

  it('rejects changes to every immutable curriculum column', async () => {
    const course = await createCourse('ACTIVE');
    const otherCourse = await createCourse('ACTIVE');
    const module = await createModule(course);
    const otherModule = await createModule(course, { position: 2 });
    const lesson = await createLesson(module, course);
    const asset = await createAsset();
    const otherAsset = await createAsset();
    const block = await createBlock(lesson, { type: 'IMAGE', assetId: asset });

    await expectPgFailure(
      `UPDATE modules SET course_id = $1 WHERE id = $2`,
      [otherCourse, module],
      {
        code: '23000',
        name: 'trg_modules_immutable_course_id',
      },
    );
    await expectPgFailure(
      `UPDATE lessons SET course_id = $1 WHERE id = $2`,
      [otherCourse, lesson],
      {
        code: '23000',
        name: 'trg_lessons_immutable_course_id',
      },
    );
    await expectPgFailure(`UPDATE assets SET type = 'VIDEO' WHERE id = $1`, [asset], {
      code: '23000',
      name: 'trg_assets_immutable_type',
    });
    await expectPgFailure(`UPDATE lesson_blocks SET type = 'ACCORDION' WHERE id = $1`, [block], {
      code: '23000',
      name: 'trg_lesson_blocks_immutable_identity',
    });
    await expectPgFailure(
      `UPDATE lesson_blocks SET lesson_id = $1 WHERE id = $2`,
      [await createLesson(otherModule, course, { position: 2 }), block],
      {
        code: '23000',
        name: 'trg_lesson_blocks_immutable_identity',
      },
    );

    await client.query(`UPDATE lessons SET module_id = $1 WHERE id = $2`, [otherModule, lesson]);
    await client.query(`UPDATE lesson_blocks SET asset_id = $1 WHERE id = $2`, [otherAsset, block]);
    await client.query(`UPDATE assets SET title = 'Mutable title' WHERE id = $1`, [otherAsset]);
  });

  it('enforces block JSON, layout shape, parent type, and asset type rules', async () => {
    const course = await createCourse();
    const module = await createModule(course);
    const lesson = await createLesson(module, course);
    const asset = await createAsset('IMAGE');
    const twoColumn = await createBlock(lesson, { type: 'TWO_COLUMN' });
    const movableBlock = await createBlock(lesson, { position: 2 });
    await createBlock(lesson, {
      type: 'IMAGE',
      assetId: asset,
      parentId: twoColumn,
      position: null,
      columnIndex: 0,
    });
    await createBlock(lesson, {
      type: 'RICH_TEXT',
      parentId: twoColumn,
      position: null,
      columnIndex: 1,
    });
    await createBlock(lesson, {
      type: 'ACCORDION',
      content: { title: 'T', body: 'B' },
      position: 3,
    });
    const emptyLayout = await createBlock(lesson, { type: 'TWO_COLUMN', position: 4 });
    await client.query(
      `DELETE FROM lesson_blocks WHERE parent_block_id = $1 AND column_index = 0`,
      [twoColumn],
    );
    await client.query(
      `UPDATE lesson_blocks SET parent_block_id = $1, position = NULL, column_index = 0
       WHERE id = $2`,
      [twoColumn, movableBlock],
    );
    await client.query(
      `UPDATE lesson_blocks SET parent_block_id = NULL, position = 2, column_index = NULL
       WHERE id = $1`,
      [movableBlock],
    );
    await createBlock(lesson, {
      type: 'IMAGE',
      assetId: asset,
      parentId: twoColumn,
      position: null,
      columnIndex: 0,
    });

    const rejectBlock = async (sql: string, values: unknown[], name: string): Promise<void> =>
      expectPgFailure(sql, values, { code: '23514', name });

    await rejectBlock(
      `INSERT INTO lesson_blocks (id, lesson_id, type, content, position, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', '[]'::jsonb, 1, now())`,
      [randomUUID(), lesson],
      'lesson_blocks_content_object',
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks (id, lesson_id, type, position, updated_at)
       VALUES ($1, $2, 'IMAGE', 8, now())`,
      [randomUUID(), lesson],
      'lesson_blocks_asset_shape',
    );
    await expectPgFailure(
      `INSERT INTO lesson_blocks (id, lesson_id, type, asset_id, position, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', $3, 9, now())`,
      [randomUUID(), lesson, asset],
      { code: '23000', name: 'trg_lesson_blocks_validate_references' },
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
      VALUES ($1, $2, 'RICH_TEXT', 5, $3, 0, now())`,
      [randomUUID(), lesson, emptyLayout],
      'lesson_blocks_parent_position_shape',
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks (id, lesson_id, type, position, column_index, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', 5, 0, now())`,
      [randomUUID(), lesson],
      'lesson_blocks_parent_column_shape',
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', NULL, $3, -1, now())`,
      [randomUUID(), lesson, emptyLayout],
      'lesson_blocks_column_index_range',
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', NULL, $3, 2, now())`,
      [randomUUID(), lesson, emptyLayout],
      'lesson_blocks_column_index_range',
    );
    const nonLayoutParent = await createBlock(lesson, { position: 6 });
    await expectPgFailure(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', $3, 0, now())`,
      [randomUUID(), lesson, nonLayoutParent],
      { code: '23000', name: 'trg_lesson_blocks_validate_references' },
    );
    await rejectBlock(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, 'TWO_COLUMN', NULL, $3, 0, now())`,
      [randomUUID(), lesson, emptyLayout],
      'lesson_blocks_no_nested_two_column',
    );
    await expectPgFailure(
      `INSERT INTO lesson_blocks (id, lesson_id, type, asset_id, updated_at)
       VALUES ($1, $2, 'TWO_COLUMN', $3, now())`,
      [randomUUID(), lesson, asset],
      { code: '23000', name: 'trg_lesson_blocks_validate_references' },
    );

    await expectPgFailure(
      `INSERT INTO lesson_blocks
         (id, lesson_id, type, position, parent_block_id, column_index, updated_at)
       VALUES ($1, $2, 'RICH_TEXT', NULL, $3, 0, now())`,
      [randomUUID(), lesson, randomUUID()],
      { code: '23000', name: 'trg_lesson_blocks_validate_references' },
    );
    const videoAsset = await createAsset('VIDEO');
    await expectPgFailure(
      `INSERT INTO lesson_blocks (id, lesson_id, type, asset_id, position, updated_at)
       VALUES ($1, $2, 'IMAGE', $3, 7, now())`,
      [randomUUID(), lesson, videoAsset],
      { code: '23000', name: 'trg_lesson_blocks_validate_references' },
    );
  });

  it('enforces key prefixes, ready-file requirements, and terminal READY/FAILED update locks', async () => {
    const imageAsset = await createAsset('IMAGE');
    const fileId = randomUUID();
    const wrongPrefix = randomUUID();
    await expectPgFailure(
      `INSERT INTO asset_files (id, asset_id, storage_key, updated_at)
       VALUES ($1, $2, $3, now())`,
      [fileId, imageAsset, `assets/${wrongPrefix}/${fileId}/original`],
      { code: '23514', name: 'asset_files_storage_key_prefix' },
    );
    await expectPgFailure(
      `INSERT INTO asset_files (id, asset_id, storage_key, updated_at)
       VALUES ($1, $2, $3, now())`,
      [fileId, imageAsset, `assets/${imageAsset}/${fileId}/`],
      { code: '23514', name: 'asset_files_storage_key_prefix' },
    );
    await expectPgFailure(
      `INSERT INTO asset_files (id, asset_id, storage_key, playback_key, updated_at)
       VALUES ($1, $2, $3, $4, now())`,
      [
        fileId,
        imageAsset,
        `assets/${imageAsset}/${fileId}/original`,
        `assets/${imageAsset}/${wrongPrefix}/playback`,
      ],
      { code: '23514', name: 'asset_files_playback_key_prefix' },
    );

    const missingMimeId = await createAssetFile(imageAsset, { mimeType: null });
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [missingMimeId]);
    await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [
      missingMimeId,
    ]);
    await expectPgFailure(
      `UPDATE asset_files SET status = 'READY' WHERE id = $1`,
      [missingMimeId],
      {
        code: '23514',
        name: 'asset_files_ready_requirements',
      },
    );

    const missingSizeId = randomUUID();
    await client.query(
      `INSERT INTO asset_files (id, asset_id, storage_key, mime_type, updated_at)
       VALUES ($1, $2, $3, 'image/png', now())`,
      [missingSizeId, imageAsset, `assets/${imageAsset}/${missingSizeId}/original`],
    );
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [missingSizeId]);
    await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [
      missingSizeId,
    ]);
    await expectPgFailure(
      `UPDATE asset_files SET status = 'READY' WHERE id = $1`,
      [missingSizeId],
      {
        code: '23514',
        name: 'asset_files_ready_requirements',
      },
    );

    const video = await createAsset('VIDEO');
    const missingPlaybackFileId = await createAssetFile(video);
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [
      missingPlaybackFileId,
    ]);
    await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [
      missingPlaybackFileId,
    ]);
    await expectPgFailure(
      `UPDATE asset_files SET status = 'READY', mime_type = 'video/mp4' WHERE id = $1`,
      [missingPlaybackFileId],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );

    const readyId = await createAssetFile(imageAsset, {
      status: 'READY',
      mimeType: 'image/png',
      sizeBytes: 1,
    });
    await expectPgFailure(
      `UPDATE asset_files SET mime_type = 'image/jpeg' WHERE id = $1`,
      [readyId],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    const failedId = await createAssetFile(imageAsset, { status: 'FAILED' });
    await expectPgFailure(`UPDATE asset_files SET last_error = 'retry' WHERE id = $1`, [failedId], {
      code: '23000',
      name: 'trg_asset_files_guard_update',
    });

    const videoFileId = await createAssetFile(video);
    const videoPrefix = `assets/${video}/${videoFileId}/`;
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [videoFileId]);
    await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [videoFileId]);
    await expectPgFailure(
      `UPDATE asset_files SET status = 'READY', mime_type = 'video/mp4', size_bytes = 1
       WHERE id = $1`,
      [videoFileId],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    await client.query(
      `UPDATE asset_files
       SET status = 'READY', mime_type = 'video/mp4', size_bytes = 1, playback_key = $1
       WHERE id = $2`,
      [`${videoPrefix}playback`, videoFileId],
    );
  });

  it('allows only one ready file per asset', async () => {
    const asset = await createAsset();
    await createAssetFile(asset, { status: 'READY', mimeType: 'image/png', sizeBytes: 1 });
    const secondId = await createAssetFile(asset);
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [secondId]);
    await client.query(`UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`, [secondId]);
    await expectPgFailure(`UPDATE asset_files SET status = 'READY' WHERE id = $1`, [secondId], {
      code: '23505',
      name: 'asset_files_one_ready_per_asset',
    });
  });

  it('allows only forward asset-file lifecycle transitions and failure from nonterminal states', async () => {
    const asset = await createAsset('PPTX');
    await createAssetFile(asset, { status: 'UPLOADED' });
    await createAssetFile(asset, { status: 'PROCESSING' });
    await createAssetFile(asset, { status: 'READY' });
    await createAssetFile(asset, { status: 'FAILED' });
    const directReadyId = randomUUID();
    await expectPgFailure(
      `INSERT INTO asset_files (id, asset_id, status, storage_key, updated_at)
       VALUES ($1, $2, 'READY', $3, now())`,
      [directReadyId, asset, `assets/${asset}/${directReadyId}/original`],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );

    const uploadFile = await createAssetFile(asset);
    await expectPgFailure(
      `UPDATE asset_files SET status = 'PROCESSING' WHERE id = $1`,
      [uploadFile],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    await expectPgFailure(`UPDATE asset_files SET status = 'READY' WHERE id = $1`, [uploadFile], {
      code: '23000',
      name: 'trg_asset_files_guard_update',
    });

    const uploadedFile = await createAssetFile(asset, { status: 'UPLOADED' });
    await expectPgFailure(
      `UPDATE asset_files SET status = 'UPLOADING' WHERE id = $1`,
      [uploadedFile],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    await expectPgFailure(`UPDATE asset_files SET status = 'READY' WHERE id = $1`, [uploadedFile], {
      code: '23000',
      name: 'trg_asset_files_guard_update',
    });
    const uploadedFailureFile = await createAssetFile(asset, { status: 'UPLOADED' });
    await client.query(`UPDATE asset_files SET status = 'FAILED' WHERE id = $1`, [
      uploadedFailureFile,
    ]);

    const processingFile = await createAssetFile(asset, { status: 'PROCESSING' });
    await expectPgFailure(
      `UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`,
      [processingFile],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    await expectPgFailure(
      `UPDATE asset_files SET status = 'UPLOADING' WHERE id = $1`,
      [processingFile],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
    await client.query(`UPDATE asset_files SET status = 'FAILED' WHERE id = $1`, [processingFile]);
  });

  it.each(['IMAGE', 'PDF'])('allows %s files to become READY without processing', async (type) => {
    const asset = await createAsset(type);
    const file = await createAssetFile(asset);
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [file]);
    await client.query(
      `UPDATE asset_files
       SET status = 'READY', mime_type = $1, size_bytes = 1
       WHERE id = $2`,
      [type === 'IMAGE' ? 'image/png' : 'application/pdf', file],
    );
    const state = await client.query(`SELECT status FROM asset_files WHERE id = $1`, [file]);
    expect(state.rows[0]?.status).toBe('READY');
  });

  it('requires VIDEO files to pass through PROCESSING before READY', async () => {
    const asset = await createAsset('VIDEO');
    const file = await createAssetFile(asset);
    await client.query(`UPDATE asset_files SET status = 'UPLOADED' WHERE id = $1`, [file]);
    await expectPgFailure(
      `UPDATE asset_files
       SET status = 'READY', mime_type = 'video/mp4', size_bytes = 1, playback_key = $1
       WHERE id = $2`,
      [`assets/${asset}/${file}/playback`, file],
      { code: '23000', name: 'trg_asset_files_guard_update' },
    );
  });

  it('enqueues a deleted asset-file prefix once and checks cleanup queue timestamps', async () => {
    const asset = await createAsset();
    const file = await createAssetFile(asset);
    await client.query('DELETE FROM asset_files WHERE id = $1', [file]);
    const prefix = `assets/${asset}/${file}/`;
    await createAssetFile(asset, { id: file });
    await client.query('DELETE FROM asset_files WHERE id = $1', [file]);
    const queued = await client.query(
      `SELECT object_key, is_prefix, count(*) OVER ()::int AS count
       FROM storage_cleanup_queue WHERE object_key = $1`,
      [prefix],
    );
    expect(queued.rows).toEqual([{ object_key: prefix, is_prefix: true, count: 1 }]);

    const schoolId = randomUUID();
    const sectionId = randomUUID();
    const studentId = randomUUID();
    const course = await createCourse('ACTIVE');
    const deliveryId = randomUUID();
    const assignmentId = randomUUID();
    const itemId = randomUUID();
    const submissionId = randomUUID();
    const submissionFileId = randomUUID();
    const submissionKey = `submissions/${schoolId}/${submissionFileId}/upload`;
    await client.query(
      `INSERT INTO schools (id, code, name, city, state, postal_code, country, updated_at)
       VALUES ($1, $2, 'Test School', 'Test City', 'State', '00000', 'Country', now())`,
      [schoolId, `T${randomUUID().slice(0, 10).toUpperCase()}`],
    );
    await client.query(
      `INSERT INTO class_sections (id, school_id, class_name, section_name, updated_at)
       VALUES ($1, $2, 'Class 5', 'A', now())`,
      [sectionId, schoolId],
    );
    await client.query(
      `INSERT INTO users (id, steamx_id, name, password_hash, role_id, user_type, school_id, updated_at)
       SELECT $1, $2, 'Test Student', 'test-hash', id, 'STUDENT', $3, now()
       FROM roles WHERE key = 'student'`,
      [studentId, `U${randomUUID().slice(0, 11).toUpperCase()}`, schoolId],
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, school_id, class_section_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [studentId, schoolId, sectionId],
    );
    await client.query(
      `INSERT INTO deliveries
         (id, school_id, course_id, class_section_id, academic_year, updated_at)
       VALUES ($1, $2, $3, $4, '2026-27', now())`,
      [deliveryId, schoolId, course, sectionId],
    );
    await client.query(
      `INSERT INTO delivery_enrollments (id, school_id, delivery_id, student_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), schoolId, deliveryId, studentId],
    );
    await client.query(
      `INSERT INTO assignments
         (id, school_id, delivery_id, course_id, title, updated_at)
       VALUES ($1, $2, $3, $4, 'Test Assignment', now())`,
      [assignmentId, schoolId, deliveryId, course],
    );
    await client.query(
      `INSERT INTO assignment_items (id, assignment_id, position, type, prompt, updated_at)
       VALUES ($1, $2, 1, 'FILE_UPLOAD', 'Upload a file', now())`,
      [itemId, assignmentId],
    );
    await client.query(
      `INSERT INTO submissions
         (id, school_id, assignment_id, delivery_id, student_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [submissionId, schoolId, assignmentId, deliveryId, studentId],
    );
    await client.query(
      `INSERT INTO submission_files
         (id, school_id, submission_id, assignment_id, item_id, storage_key, filename, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, 'upload.bin', 'application/octet-stream', 1)`,
      [submissionFileId, schoolId, submissionId, assignmentId, itemId, submissionKey],
    );
    await client.query('DELETE FROM submission_files WHERE id = $1', [submissionFileId]);
    const submissionCleanup = await client.query(
      `SELECT object_key, is_prefix FROM storage_cleanup_queue WHERE object_key = $1`,
      [submissionKey],
    );
    expect(submissionCleanup.rows).toEqual([{ object_key: submissionKey, is_prefix: false }]);

    await expectPgFailure(
      `INSERT INTO storage_cleanup_queue (id, object_key, queued_at, done_at)
       VALUES ($1, 'invalid-order', now(), now() - interval '1 second')`,
      [randomUUID()],
      { code: '23514', name: 'storage_cleanup_queue_done_after_queued' },
    );
    await client.query(`UPDATE storage_cleanup_queue SET done_at = now() WHERE object_key = $1`, [
      prefix,
    ]);
    await client.query(
      `INSERT INTO storage_cleanup_queue (id, object_key, queued_at)
       VALUES ($1, $2, now())`,
      [randomUUID(), prefix],
    );
  });
});
