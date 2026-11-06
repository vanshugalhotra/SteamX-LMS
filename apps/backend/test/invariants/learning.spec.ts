import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSION } from '../../src/auth/permissions.js';
import {
  AssetType,
  BlockType,
  ContentStatus,
  EnrollmentStatus,
  LessonAudience,
} from '../../src/generated/prisma/client.js';
import { createTestAssetWithReadyFile } from '../support/factories/curriculum.js';
import { createTwoSchoolFixture, type TwoSchoolFixture } from '../support/factories/fixtures.js';
import {
  assertEveryResponseSafe,
  assertStatus,
  startInvariantApi,
  type InvariantApi,
} from '../support/invariant-api.js';

type LearningGroup = {
  courseId: string;
  deliveryId: string;
  unassignedDeliveryId: string;
  studentLessonId: string;
  teacherLessonId: string;
  draftLessonId: string;
  studentAssetId: string;
  teacherAssetId: string;
};

const PRIVATE_FIELDS = new Set([
  'audience',
  'bucket',
  'contentversion',
  'createdat',
  'fileid',
  'filestatus',
  'lasterror',
  'playbackkey',
  'permanenturl',
  'processingjobid',
  'release',
  'releaseid',
  'releasedat',
  'releasedby',
  'releasedbyid',
  'status',
  'storagekey',
  'uploadid',
  'updatedat',
  'version',
]);

describe('Learning API invariants', () => {
  let api: InvariantApi;
  let fixture: TwoSchoolFixture;
  let adminCookie: string;
  let studentACookie: string;
  let studentBCookie: string;
  let teacherACookie: string;
  let teacherBCookie: string;
  let groupA: LearningGroup;
  let groupB: LearningGroup;

  beforeAll(async () => {
    api = await startInvariantApi({ teacherPermissions: [PERMISSION.LEARNING_READ] });
    fixture = await createTwoSchoolFixture(api.prisma);
    [adminCookie, studentACookie, studentBCookie, teacherACookie, teacherBCookie] =
      await Promise.all([
        api.login({ steamxId: fixture.admin.steamxId, password: fixture.admin.password }),
        api.login({
          steamxId: fixture.schoolA.student.steamxId,
          password: fixture.schoolA.student.password,
        }),
        api.login({
          steamxId: fixture.schoolB.student.steamxId,
          password: fixture.schoolB.student.password,
        }),
        api.login({
          steamxId: fixture.schoolA.teacher.steamxId,
          password: fixture.schoolA.teacher.password,
        }),
        api.login({
          steamxId: fixture.schoolB.teacher.steamxId,
          password: fixture.schoolB.teacher.password,
        }),
      ]).then((sessions) => sessions.map(({ cookie }) => cookie));

    groupA = await createLearningGroup(api, {
      schoolId: fixture.schoolA.school.id,
      classSectionId: fixture.schoolA.section.id,
      studentId: fixture.schoolA.student.id,
      teacherId: fixture.schoolA.teacher.id,
      academicYear: '2026-27',
      adminCookie,
    });
    groupB = await createLearningGroup(api, {
      schoolId: fixture.schoolB.school.id,
      classSectionId: fixture.schoolB.section.id,
      studentId: fixture.schoolB.student.id,
      teacherId: fixture.schoolB.teacher.id,
      academicYear: '2026-27',
      adminCookie,
    });
  });

  afterAll(async () => api?.close());

  it('enforces school, enrollment, audience, release, teacher, response-shape, and progress rules', async () => {
    const listed = await learning('GET', '/api/v1/learning/courses', studentACookie);
    assertStatus(listed, 200);
    expect(listed.body.items.map((item: { deliveryId: string }) => item.deliveryId)).toEqual([
      groupA.deliveryId,
    ]);

    const outline = await learning(
      'GET',
      `/api/v1/learning/deliveries/${groupA.deliveryId}/outline`,
      studentACookie,
    );
    assertStatus(outline, 200);
    expect(
      outline.body.modules.flatMap((module: { lessons: Array<{ id: string }> }) =>
        module.lessons.map(({ id }) => id),
      ),
    ).toEqual([groupA.studentLessonId]);

    const content = await learning(
      'GET',
      lessonContentPath(groupA.deliveryId, groupA.studentLessonId),
      studentACookie,
    );
    assertStatus(content, 200);
    expect(content.body.blocks).toHaveLength(1);
    expect(content.body.assets.map((asset: { id: string }) => asset.id)).toEqual([
      groupA.studentAssetId,
    ]);

    const assetAccess = await learning(
      'GET',
      lessonAssetPath(groupA.deliveryId, groupA.studentLessonId, groupA.studentAssetId),
      studentACookie,
    );
    assertStatus(assetAccess, 200);
    expect(Date.parse(assetAccess.body.expiresAt)).toBeGreaterThan(Date.now());

    const completion = await learning(
      'PUT',
      completionPath(groupA.deliveryId, groupA.studentLessonId),
      studentACookie,
    );
    assertStatus(completion, 200);
    const repeatedCompletion = await learning(
      'PUT',
      completionPath(groupA.deliveryId, groupA.studentLessonId),
      studentACookie,
    );
    assertStatus(repeatedCompletion, 200);
    expect(repeatedCompletion.body.completedAt).toBe(completion.body.completedAt);

    await expectCountsToMatch(groupA.deliveryId, studentACookie, 1, 1);

    for (const lessonId of [groupA.teacherLessonId, groupA.draftLessonId]) {
      assertStatus(
        await learning('GET', lessonContentPath(groupA.deliveryId, lessonId), studentACookie),
        404,
        'NOT_FOUND',
      );
      assertStatus(
        await learning('PUT', completionPath(groupA.deliveryId, lessonId), studentACookie),
        404,
        'NOT_FOUND',
      );
    }
    assertStatus(
      await learning(
        'GET',
        lessonAssetPath(groupA.deliveryId, groupA.teacherLessonId, groupA.teacherAssetId),
        studentACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonContentPath(groupA.unassignedDeliveryId, groupA.studentLessonId),
        studentACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        `/api/v1/learning/deliveries/${groupA.unassignedDeliveryId}/progress`,
        studentACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'PUT',
        completionPath(groupA.unassignedDeliveryId, groupA.studentLessonId),
        studentACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonAssetPath(groupA.unassignedDeliveryId, groupA.studentLessonId, groupA.studentAssetId),
        studentACookie,
      ),
      404,
      'NOT_FOUND',
    );

    const teacherContent = await learning(
      'GET',
      lessonContentPath(groupA.deliveryId, groupA.teacherLessonId),
      teacherACookie,
    );
    assertStatus(teacherContent, 200);
    assertStatus(
      await learning(
        'GET',
        lessonAssetPath(groupA.deliveryId, groupA.teacherLessonId, groupA.teacherAssetId),
        teacherACookie,
      ),
      200,
    );
    assertStatus(
      await learning(
        'GET',
        lessonContentPath(groupA.deliveryId, groupA.studentLessonId),
        teacherBCookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonContentPath(groupA.deliveryId, groupA.draftLessonId),
        teacherACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonContentPath(groupA.unassignedDeliveryId, groupA.teacherLessonId),
        teacherACookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonAssetPath(groupA.unassignedDeliveryId, groupA.teacherLessonId, groupA.teacherAssetId),
        teacherACookie,
      ),
      404,
      'NOT_FOUND',
    );

    await assertCrossSchoolNotFound(groupA, studentACookie, groupB);
    await assertCrossSchoolNotFound(groupB, studentBCookie, groupA);
    await assertTeacherCrossSchoolNotFound(groupA, teacherACookie, groupB);
    await assertTeacherCrossSchoolNotFound(groupB, teacherBCookie, groupA);

    const unrelease = await api.send(
      'DELETE',
      `/api/v1/deliveries/${groupA.deliveryId}/releases/lessons/${groupA.studentLessonId}`,
      { cookie: adminCookie },
    );
    assertStatus(unrelease, 204);
    for (const [method, path] of [
      ['GET', lessonContentPath(groupA.deliveryId, groupA.studentLessonId)],
      ['GET', lessonAssetPath(groupA.deliveryId, groupA.studentLessonId, groupA.studentAssetId)],
      ['PUT', completionPath(groupA.deliveryId, groupA.studentLessonId)],
    ] as const) {
      assertStatus(await learning(method, path, studentACookie), 404, 'NOT_FOUND');
    }
    await expectCountsToMatch(groupA.deliveryId, studentACookie, 0, 0);

    const rerelease = await api.send(
      'PUT',
      `/api/v1/deliveries/${groupA.deliveryId}/releases/lessons/${groupA.studentLessonId}`,
      { cookie: adminCookie },
    );
    assertStatus(rerelease, 200);
    await expectCountsToMatch(groupA.deliveryId, studentACookie, 1, 1);

    expect(
      api.routes.some(
        ({ path }) =>
          path.startsWith('/api/v1/learning') &&
          path.includes('/assets/') &&
          !path.includes('/lessons/'),
      ),
    ).toBe(false);
    assertStatus(
      await learning(
        'GET',
        `/api/v1/learning/assets/${groupA.studentAssetId}/access`,
        studentACookie,
      ),
      404,
    );

    assertEveryResponseSafe(api);
  });

  async function learning(method: string, path: string, cookie: string) {
    const response = await api.send(method, path, { cookie });
    assertLearningResponseIsSafe(path, response.body);
    return response;
  }

  async function expectCountsToMatch(
    deliveryId: string,
    cookie: string,
    totalLessons: number,
    completedLessons: number,
  ) {
    const courses = await learning('GET', '/api/v1/learning/courses', cookie);
    const course = courses.body.items.find(
      (item: { deliveryId: string }) => item.deliveryId === deliveryId,
    );
    expect(course).toBeDefined();
    const progress = await learning(
      'GET',
      `/api/v1/learning/deliveries/${deliveryId}/progress`,
      cookie,
    );
    assertStatus(progress, 200);
    expect(course).toMatchObject({ totalLessons, completedLessons });
    expect(progress.body).toMatchObject({ totalLessons, completedLessons });
    expect(progress.body.completedLessons).toBeLessThanOrEqual(progress.body.totalLessons);
    expect(course.completedLessons).toBeLessThanOrEqual(course.totalLessons);
    expect(
      progress.body.modules.reduce(
        (total: number, module: { totalLessons: number }) => total + module.totalLessons,
        0,
      ),
    ).toBe(progress.body.totalLessons);
    for (const module of progress.body.modules) {
      expect(module.completedLessons).toBeLessThanOrEqual(module.totalLessons);
    }
  }

  async function assertCrossSchoolNotFound(
    own: LearningGroup,
    cookie: string,
    foreign: LearningGroup,
  ) {
    const foreignPaths: Array<[string, string]> = [
      ['GET', `/api/v1/learning/deliveries/${foreign.deliveryId}/outline`],
      ['GET', `/api/v1/learning/deliveries/${foreign.deliveryId}/progress`],
      ['PUT', completionPath(foreign.deliveryId, foreign.studentLessonId)],
      ['GET', lessonContentPath(foreign.deliveryId, foreign.studentLessonId)],
      ['GET', lessonAssetPath(foreign.deliveryId, foreign.studentLessonId, foreign.studentAssetId)],
    ];
    for (const [method, path] of foreignPaths) {
      assertStatus(await learning(method, path, cookie), 404, 'NOT_FOUND');
    }

    const courses = await learning('GET', '/api/v1/learning/courses', cookie);
    expect(courses.body.items.map((item: { deliveryId: string }) => item.deliveryId)).not.toContain(
      foreign.deliveryId,
    );
    expect(courses.body.items.map((item: { deliveryId: string }) => item.deliveryId)).toContain(
      own.deliveryId,
    );
  }

  async function assertTeacherCrossSchoolNotFound(
    own: LearningGroup,
    cookie: string,
    foreign: LearningGroup,
  ) {
    assertStatus(
      await learning('GET', lessonContentPath(foreign.deliveryId, foreign.studentLessonId), cookie),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning(
        'GET',
        lessonAssetPath(foreign.deliveryId, foreign.studentLessonId, foreign.studentAssetId),
        cookie,
      ),
      404,
      'NOT_FOUND',
    );
    assertStatus(
      await learning('GET', lessonContentPath(own.deliveryId, own.teacherLessonId), cookie),
      200,
    );
  }
});

async function createLearningGroup(
  api: InvariantApi,
  input: {
    schoolId: string;
    classSectionId: string;
    studentId: string;
    teacherId: string;
    academicYear: string;
    adminCookie: string;
  },
): Promise<LearningGroup> {
  const course = await api.prisma.course.create({
    data: {
      title: `Invariant course ${randomUUID()}`,
      status: ContentStatus.ACTIVE,
    },
    select: { id: true },
  });
  await api.prisma.$executeRaw`
    INSERT INTO subscriptions
      (id, school_id, course_id, start_date, end_date, max_deliveries, updated_at)
    VALUES
      (gen_random_uuid(), ${input.schoolId}::uuid, ${course.id}::uuid,
       business_today(), business_today() + 30, 10, now())
  `;
  const delivery = await api.prisma.delivery.create({
    data: {
      schoolId: input.schoolId,
      courseId: course.id,
      classSectionId: input.classSectionId,
      academicYear: input.academicYear,
    },
    select: { id: true },
  });
  const unassignedDelivery = await api.prisma.delivery.create({
    data: {
      schoolId: input.schoolId,
      courseId: course.id,
      classSectionId: input.classSectionId,
      academicYear: '2027-28',
    },
    select: { id: true },
  });
  await api.prisma.deliveryEnrollment.create({
    data: { schoolId: input.schoolId, deliveryId: delivery.id, studentId: input.studentId },
  });
  const removedEnrollment = await api.prisma.deliveryEnrollment.create({
    data: {
      schoolId: input.schoolId,
      deliveryId: unassignedDelivery.id,
      studentId: input.studentId,
    },
    select: { id: true },
  });
  await api.prisma.deliveryEnrollment.update({
    where: { id: removedEnrollment.id },
    data: { status: EnrollmentStatus.REMOVED, endedAt: new Date() },
  });
  await api.prisma.deliveryTeacher.create({
    data: { schoolId: input.schoolId, deliveryId: delivery.id, teacherId: input.teacherId },
  });

  const module = await api.prisma.module.create({
    data: {
      courseId: course.id,
      title: `Invariant module ${randomUUID()}`,
      position: 1,
      status: ContentStatus.ACTIVE,
      lessons: {
        create: [
          {
            title: 'Released student lesson',
            position: 1,
            status: ContentStatus.ACTIVE,
            audience: LessonAudience.STUDENT,
          },
          {
            title: 'Teacher-only lesson',
            position: 2,
            status: ContentStatus.ACTIVE,
            audience: LessonAudience.TEACHER_ONLY,
          },
          {
            title: 'Draft student lesson',
            position: 3,
            status: ContentStatus.DRAFT,
            audience: LessonAudience.STUDENT,
          },
        ],
      },
    },
    select: { id: true, lessons: { select: { id: true, audience: true, status: true } } },
  });
  const studentLesson = module.lessons.find(
    ({ audience, status }) =>
      audience === LessonAudience.STUDENT && status === ContentStatus.ACTIVE,
  );
  const teacherLesson = module.lessons.find(
    ({ audience }) => audience === LessonAudience.TEACHER_ONLY,
  );
  const draftLesson = module.lessons.find(({ status }) => status === ContentStatus.DRAFT);
  if (!studentLesson || !teacherLesson || !draftLesson) {
    throw new Error('Learning fixture did not create its expected lessons.');
  }
  const studentAsset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
  const teacherAsset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
  const lessonAssets: Array<[string, string]> = [
    [studentLesson.id, studentAsset.assetId],
    [teacherLesson.id, teacherAsset.assetId],
  ];
  for (const [lessonId, assetId] of lessonAssets) {
    await api.prisma.lessonBlock.create({
      data: {
        lessonId,
        type: BlockType.IMAGE,
        assetId,
        content: { alt: 'Learning test image' },
        position: 1,
      },
    });
  }

  const group: LearningGroup = {
    courseId: course.id,
    deliveryId: delivery.id,
    unassignedDeliveryId: unassignedDelivery.id,
    studentLessonId: studentLesson.id,
    teacherLessonId: teacherLesson.id,
    draftLessonId: draftLesson.id,
    studentAssetId: studentAsset.assetId,
    teacherAssetId: teacherAsset.assetId,
  };
  for (const deliveryId of [delivery.id, unassignedDelivery.id]) {
    assertStatus(
      await api.send(
        'PUT',
        `/api/v1/deliveries/${deliveryId}/releases/lessons/${studentLesson.id}`,
        { cookie: input.adminCookie },
      ),
      200,
    );
  }
  return group;
}

function assertLearningResponseIsSafe(path: string, body: unknown): void {
  const isAssetAccess = path.includes('/lessons/') && path.endsWith('/access');
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    for (const [childKey, child] of Object.entries(value)) {
      const normalizedKey = childKey.toLowerCase();
      if (
        PRIVATE_FIELDS.has(normalizedKey) ||
        normalizedKey.startsWith('release') ||
        normalizedKey.endsWith('status') ||
        (normalizedKey.endsWith('url') && normalizedKey !== 'url')
      ) {
        throw new Error(`Private learning field "${childKey}" found in response.`);
      }
      if (normalizedKey === 'url' && !isAssetAccess) {
        throw new Error('A URL was returned outside the temporary asset-access response.');
      }
      if (normalizedKey === 'url' && isAssetAccess && typeof child !== 'string') {
        throw new Error('The asset-access URL must be a string.');
      }
      visit(child);
    }
  };
  visit(body);
  if (isAssetAccess && isRecord(body) && typeof body.url === 'string') {
    const expiry = Date.parse(String(body.expiresAt));
    if (
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + 12 * 60 * 60 * 1000
    ) {
      throw new Error('Learning asset access must return a short-lived URL expiry.');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function lessonContentPath(deliveryId: string, lessonId: string): string {
  return `/api/v1/learning/deliveries/${deliveryId}/lessons/${lessonId}/content`;
}

function completionPath(deliveryId: string, lessonId: string): string {
  return `/api/v1/learning/deliveries/${deliveryId}/lessons/${lessonId}/completion`;
}

function lessonAssetPath(deliveryId: string, lessonId: string, assetId: string): string {
  return `/api/v1/learning/deliveries/${deliveryId}/lessons/${lessonId}/assets/${assetId}/access`;
}
