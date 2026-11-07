import { Injectable } from '@nestjs/common';
import {
  AssetFileStatus,
  ContentStatus,
  DeliveryStatus,
  EnrollmentStatus,
  LessonAudience,
  Prisma,
} from '../generated/prisma/client.js';
import { paginatedSearch } from '../common/repositories/paginated-search.js';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

function releasedStudentLessonFilter() {
  return Prisma.sql`
    l.status IN ('ACTIVE'::content_status, 'ARCHIVED'::content_status)
    AND l.audience = 'STUDENT'::lesson_audience
  `;
}

const LEARNING_DELIVERY_SELECT = {
  id: true,
  schoolId: true,
  courseId: true,
  status: true,
} satisfies Prisma.DeliverySelect;

const LEARNING_LESSON_SELECT = {
  id: true,
  moduleId: true,
  status: true,
  audience: true,
} satisfies Prisma.LessonSelect;

const LEARNING_SERVABLE_ASSET_SELECT = {
  type: true,
  files: {
    where: { status: AssetFileStatus.READY },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      id: true,
      assetId: true,
      storageKey: true,
      playbackKey: true,
      originalFilename: true,
      mimeType: true,
    },
  },
} satisfies Prisma.AssetSelect;

const STUDENT_COURSE_SELECT = {
  deliveryId: true,
  delivery: {
    select: {
      academicYear: true,
      label: true,
      course: { select: { id: true, title: true, description: true } },
    },
  },
} satisfies Prisma.DeliveryEnrollmentSelect;

export type StudentCourseRecord = Prisma.DeliveryEnrollmentGetPayload<{
  select: typeof STUDENT_COURSE_SELECT;
}>;

export type LearningCountRecord = {
  deliveryId: string;
  count: number;
};

export type LearningOutlineRecord = {
  deliveryId: string;
  courseId: string;
  courseTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  modulePosition: number | null;
  lessonId: string | null;
  lessonTitle: string | null;
  lessonPosition: number | null;
  completed: boolean;
};

export type LearningProgressModuleRecord = {
  moduleId: string;
  title: string;
  position: number;
  totalLessons: number;
  completedLessons: number;
};

export type LearningLessonCompletionRecord = {
  lessonId: string;
  completedAt: Date;
};

/** Queries delivery and lesson visibility for student and teacher learning reads. */
@Injectable()
export class LearningAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Loads an active delivery only when the student has an active enrollment in it. */
  findStudentDelivery(deliveryId: string, schoolId: string, studentId: string) {
    return this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        schoolId,
        status: DeliveryStatus.ACTIVE,
        enrollments: {
          some: { studentId, status: EnrollmentStatus.ACTIVE },
        },
      },
      select: LEARNING_DELIVERY_SELECT,
    });
  }

  /** Loads a readable active or archived lesson with student-only release and audience filters. */
  findLesson(deliveryId: string, courseId: string, lessonId: string, role: 'STUDENT' | 'TEACHER') {
    const where: Prisma.LessonWhereInput = {
      id: lessonId,
      courseId,
      status: { in: [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] },
    };
    if (role === 'STUDENT') {
      where.audience = LessonAudience.STUDENT;
      where.releases = { some: { deliveryId } };
    }

    return this.prisma.lesson.findFirst({
      where,
      select: LEARNING_LESSON_SELECT,
    });
  }

  /** Loads a READY asset only when the requested lesson contains its block reference. */
  async findServableAsset(lessonId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        status: { in: [ContentStatus.ACTIVE, ContentStatus.ARCHIVED] },
        blocks: { some: { lessonId } },
        files: { some: { status: AssetFileStatus.READY } },
      },
      select: LEARNING_SERVABLE_ASSET_SELECT,
    });
    const file = asset?.files[0];
    return asset && file ? { type: asset.type, file } : null;
  }

  /** Reads the authenticated actor's school name for the learning watermark. */
  findSchoolNameById(schoolId: string): Promise<{ name: string } | null> {
    return this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });
  }

  /** Loads one page of a student's active enrollments in active deliveries. */
  findStudentCourses(studentId: string, schoolId: string, query: PaginationQueryDto) {
    const where: Prisma.DeliveryEnrollmentWhereInput = {
      studentId,
      schoolId,
      status: EnrollmentStatus.ACTIVE,
      delivery: { status: DeliveryStatus.ACTIVE },
    };
    const orderBy = [
      { delivery: { course: { title: 'asc' } } },
      { delivery: { academicYear: 'asc' } },
      { deliveryId: 'asc' },
    ] satisfies Prisma.DeliveryEnrollmentOrderByWithRelationInput[];

    return paginatedSearch({
      where,
      orderBy,
      page: query.page,
      limit: query.limit,
      findMany: (args) =>
        this.prisma.deliveryEnrollment.findMany({
          ...args,
          select: STUDENT_COURSE_SELECT,
        }),
      count: (filter) => this.prisma.deliveryEnrollment.count({ where: filter }),
    });
  }

  /** Groups eligible lesson totals and completions for every delivery on the current page. */
  async findStudentCourseLessonCounts(
    deliveryIds: string[],
    studentId: string,
  ): Promise<{ totals: LearningCountRecord[]; completions: LearningCountRecord[] }> {
    if (deliveryIds.length === 0) {
      return { totals: [], completions: [] };
    }

    const deliveryIdsSql = Prisma.join(deliveryIds.map((id) => Prisma.sql`${id}::uuid`));
    const lessonFilter = releasedStudentLessonFilter();
    const [totals, completions] = await Promise.all([
      this.prisma.$queryRaw<LearningCountRecord[]>(Prisma.sql`
        SELECT r.delivery_id::text AS "deliveryId", COUNT(*)::int AS count
        FROM delivery_lesson_releases r
        JOIN lessons l ON l.id = r.lesson_id AND l.course_id = r.course_id
        WHERE r.delivery_id IN (${deliveryIdsSql})
          AND ${lessonFilter}
        GROUP BY r.delivery_id
      `),
      this.prisma.$queryRaw<LearningCountRecord[]>(Prisma.sql`
        SELECT c.delivery_id::text AS "deliveryId", COUNT(*)::int AS count
        FROM lesson_completions c
        JOIN delivery_lesson_releases r
          ON r.delivery_id = c.delivery_id
         AND r.lesson_id = c.lesson_id
         AND r.course_id = c.course_id
        JOIN lessons l ON l.id = r.lesson_id AND l.course_id = r.course_id
        WHERE c.delivery_id IN (${deliveryIdsSql})
          AND c.student_id = ${studentId}::uuid
          AND ${lessonFilter}
        GROUP BY c.delivery_id
      `),
    ]);

    return { totals, completions };
  }

  /** Inserts a completion once and returns its original timestamp when it already exists. */
  async completeStudentLesson(input: {
    schoolId: string;
    deliveryId: string;
    studentId: string;
    lessonId: string;
    courseId: string;
  }): Promise<LearningLessonCompletionRecord | null> {
    const inserted = await this.prisma.$queryRaw<LearningLessonCompletionRecord[]>(Prisma.sql`
      INSERT INTO lesson_completions
        (id, school_id, delivery_id, student_id, lesson_id, course_id)
      VALUES
        (gen_random_uuid(), ${input.schoolId}::uuid, ${input.deliveryId}::uuid,
         ${input.studentId}::uuid, ${input.lessonId}::uuid, ${input.courseId}::uuid)
      ON CONFLICT (delivery_id, student_id, lesson_id) DO NOTHING
      RETURNING lesson_id::text AS "lessonId", completed_at AS "completedAt"
    `);
    const completion = inserted[0];
    if (completion) {
      return completion;
    }

    const existing = await this.prisma.$queryRaw<LearningLessonCompletionRecord[]>(Prisma.sql`
      SELECT lesson_id::text AS "lessonId", completed_at AS "completedAt"
      FROM lesson_completions
      WHERE delivery_id = ${input.deliveryId}::uuid
        AND student_id = ${input.studentId}::uuid
        AND lesson_id = ${input.lessonId}::uuid
    `);
    return existing[0] ?? null;
  }

  /** Groups a student's released lesson totals and completions by module. */
  findStudentProgress(
    deliveryId: string,
    courseId: string,
    studentId: string,
  ): Promise<LearningProgressModuleRecord[]> {
    const lessonFilter = releasedStudentLessonFilter();
    return this.prisma.$queryRaw<LearningProgressModuleRecord[]>(Prisma.sql`
      SELECT
        m.id::text AS "moduleId",
        m.title AS title,
        m.position AS position,
        COUNT(*)::int AS "totalLessons",
        COUNT(lc.lesson_id)::int AS "completedLessons"
      FROM delivery_lesson_releases r
      JOIN lessons l
        ON l.id = r.lesson_id
       AND l.course_id = r.course_id
      JOIN modules m
        ON m.id = l.module_id
       AND m.course_id = l.course_id
      LEFT JOIN lesson_completions lc
        ON lc.delivery_id = r.delivery_id
       AND lc.student_id = ${studentId}::uuid
       AND lc.lesson_id = l.id
      WHERE r.delivery_id = ${deliveryId}::uuid
        AND r.course_id = ${courseId}::uuid
        AND ${lessonFilter}
      GROUP BY m.id, m.title, m.position
      ORDER BY m.position ASC, m.id ASC
    `);
  }

  /** Loads a delivery's filtered student outline as ordered rows for one student. */
  findStudentOutline(
    deliveryId: string,
    schoolId: string,
    courseId: string,
    studentId: string,
  ): Promise<LearningOutlineRecord[]> {
    const lessonFilter = releasedStudentLessonFilter();
    return this.prisma.$queryRaw<LearningOutlineRecord[]>(Prisma.sql`
      SELECT
        d.id::text AS "deliveryId",
        c.id::text AS "courseId",
        c.title AS "courseTitle",
        m.id::text AS "moduleId",
        m.title AS "moduleTitle",
        m.position AS "modulePosition",
        l.id::text AS "lessonId",
        l.title AS "lessonTitle",
        l.position AS "lessonPosition",
        (lc.id IS NOT NULL) AS completed
      FROM deliveries d
      JOIN courses c ON c.id = d.course_id
      LEFT JOIN modules m ON m.course_id = c.id
      LEFT JOIN lessons l
        ON l.module_id = m.id
       AND l.course_id = c.id
       AND EXISTS (
         SELECT 1
         FROM delivery_lesson_releases r
         WHERE r.delivery_id = d.id
           AND r.lesson_id = l.id
           AND r.course_id = l.course_id
       )
       AND ${lessonFilter}
      LEFT JOIN lesson_completions lc
        ON lc.delivery_id = d.id
       AND lc.student_id = ${studentId}::uuid
       AND lc.lesson_id = l.id
      WHERE d.id = ${deliveryId}::uuid
        AND d.school_id = ${schoolId}::uuid
        AND d.course_id = ${courseId}::uuid
      ORDER BY m.position ASC, l.position ASC
    `);
  }
}
