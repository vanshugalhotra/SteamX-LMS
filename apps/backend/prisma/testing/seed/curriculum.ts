/** Creates a mixed-status course outline and representative validated lesson content. */
import type { PrismaClient } from '../../../src/generated/prisma/client.js';
import type { AssetSeed } from './assets.js';

export type CurriculumSeed = {
  courses: {
    active: string;
    expired: string;
    future: string;
    renewal: string;
    cap: string;
  };
};

const IDS = {
  activeCourse: '019a0000-0000-7000-8000-000000000401',
  expiredCourse: '019a0000-0000-7000-8000-000000000402',
  futureCourse: '019a0000-0000-7000-8000-000000000403',
  renewalCourse: '019a0000-0000-7000-8000-000000000404',
  capCourse: '019a0000-0000-7000-8000-000000000405',
  draftCourse: '019a0000-0000-7000-8000-000000000406',
  archivedCourse: '019a0000-0000-7000-8000-000000000407',
  activeModule: '019a0000-0000-7000-8000-000000000411',
  draftModule: '019a0000-0000-7000-8000-000000000412',
  archivedModule: '019a0000-0000-7000-8000-000000000413',
  studentLesson: '019a0000-0000-7000-8000-000000000421',
  teacherLesson: '019a0000-0000-7000-8000-000000000422',
  draftLesson: '019a0000-0000-7000-8000-000000000423',
  nestedDraftLesson: '019a0000-0000-7000-8000-000000000424',
  archivedLesson: '019a0000-0000-7000-8000-000000000425',
  richTextBlock: '019a0000-0000-7000-8000-000000000431',
  imageBlock: '019a0000-0000-7000-8000-000000000432',
  videoBlock: '019a0000-0000-7000-8000-000000000433',
  pdfBlock: '019a0000-0000-7000-8000-000000000434',
  accordionBlock: '019a0000-0000-7000-8000-000000000435',
  twoColumnBlock: '019a0000-0000-7000-8000-000000000436',
  columnTextBlock: '019a0000-0000-7000-8000-000000000437',
  columnImageBlock: '019a0000-0000-7000-8000-000000000438',
  teacherTextBlock: '019a0000-0000-7000-8000-000000000439',
} as const;

const richText = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Inserts parent content before child rows to satisfy self-relations and database checks. */
export async function seedCurriculum(
  prisma: PrismaClient,
  assets: AssetSeed,
): Promise<CurriculumSeed> {
  await prisma.$transaction(async (tx) => {
    await tx.course.createMany({
      data: [
        {
          id: IDS.activeCourse,
          title: 'Foundations of Robotics',
          description: 'Build, program, and test classroom robots.',
          status: 'ACTIVE',
        },
        { id: IDS.expiredCourse, title: 'Expired Subscription Lab', status: 'ACTIVE' },
        { id: IDS.futureCourse, title: 'Advanced Robotics', status: 'ACTIVE' },
        { id: IDS.renewalCourse, title: 'Robot Math and Measurement', status: 'ACTIVE' },
        { id: IDS.capCourse, title: 'Robotics Design Studio', status: 'ACTIVE' },
        { id: IDS.draftCourse, title: 'Draft Course Example', status: 'DRAFT' },
        { id: IDS.archivedCourse, title: 'Archived Course Example', status: 'ARCHIVED' },
      ],
    });

    await tx.module.createMany({
      data: [
        {
          id: IDS.activeModule,
          courseId: IDS.activeCourse,
          title: 'Robot Design and Sensors',
          position: 1,
          status: 'ACTIVE',
        },
        {
          id: IDS.draftModule,
          courseId: IDS.activeCourse,
          title: 'Draft Module Example',
          position: 2,
          status: 'DRAFT',
        },
        {
          id: IDS.archivedModule,
          courseId: IDS.activeCourse,
          title: 'Archived Module Example',
          position: 3,
          status: 'ARCHIVED',
        },
      ],
    });

    await tx.lesson.createMany({
      data: [
        {
          id: IDS.studentLesson,
          moduleId: IDS.activeModule,
          courseId: IDS.activeCourse,
          title: 'Build a Line-Following Robot',
          position: 1,
          status: 'ACTIVE',
          audience: 'STUDENT',
          contentVersion: 7,
        },
        {
          id: IDS.teacherLesson,
          moduleId: IDS.activeModule,
          courseId: IDS.activeCourse,
          title: 'Teacher Robotics Lab Notes',
          position: 2,
          status: 'ACTIVE',
          audience: 'TEACHER_ONLY',
        },
        {
          id: IDS.draftLesson,
          moduleId: IDS.activeModule,
          courseId: IDS.activeCourse,
          title: 'Draft Lesson Example',
          position: 3,
          status: 'DRAFT',
          audience: 'STUDENT',
        },
        {
          id: IDS.nestedDraftLesson,
          moduleId: IDS.draftModule,
          courseId: IDS.activeCourse,
          title: 'Lesson in Draft Module',
          position: 1,
          status: 'DRAFT',
          audience: 'TEACHER_ONLY',
        },
        {
          id: IDS.archivedLesson,
          moduleId: IDS.archivedModule,
          courseId: IDS.activeCourse,
          title: 'Archived Lesson Example',
          position: 1,
          status: 'ARCHIVED',
          audience: 'STUDENT',
        },
      ],
    });

    await tx.lessonBlock.createMany({
      data: [
        {
          id: IDS.richTextBlock,
          lessonId: IDS.studentLesson,
          type: 'RICH_TEXT',
          position: 1,
          content: richText('A robot follows instructions from its program and sensor inputs.'),
        },
        {
          id: IDS.imageBlock,
          lessonId: IDS.studentLesson,
          type: 'IMAGE',
          assetId: assets.readyImageId,
          position: 2,
          content: {
            alt: 'A labeled robot arm diagram',
            caption: 'Identify each joint and motor.',
          },
        },
        {
          id: IDS.videoBlock,
          lessonId: IDS.studentLesson,
          type: 'VIDEO',
          assetId: assets.readyVideoId,
          position: 3,
          content: { caption: 'Watch the robot follow a track.' },
        },
        {
          id: IDS.pdfBlock,
          lessonId: IDS.studentLesson,
          type: 'PDF',
          assetId: assets.readyPdfId,
          position: 4,
          content: { caption: 'Use the build guide during the lab.' },
        },
        {
          id: IDS.accordionBlock,
          lessonId: IDS.studentLesson,
          type: 'ACCORDION',
          position: 5,
          content: {
            title: 'Think like an engineer',
            body: richText('How could you make the robot turn more accurately?'),
          },
        },
        {
          id: IDS.twoColumnBlock,
          lessonId: IDS.studentLesson,
          type: 'TWO_COLUMN',
          position: 6,
          content: {},
        },
        {
          id: IDS.teacherTextBlock,
          lessonId: IDS.teacherLesson,
          type: 'RICH_TEXT',
          position: 1,
          content: richText('Check the motors, sensors, and battery before the robotics lab.'),
        },
      ],
    });

    await tx.lessonBlock.createMany({
      data: [
        {
          id: IDS.columnTextBlock,
          lessonId: IDS.studentLesson,
          parentBlockId: IDS.twoColumnBlock,
          columnIndex: 0,
          type: 'RICH_TEXT',
          content: richText('A sensor detects the line and sends input to the controller.'),
        },
        {
          id: IDS.columnImageBlock,
          lessonId: IDS.studentLesson,
          parentBlockId: IDS.twoColumnBlock,
          columnIndex: 1,
          type: 'IMAGE',
          assetId: assets.readyImageId,
          content: { alt: 'The same robot arm diagram in a column' },
        },
      ],
    });
  });

  return {
    courses: {
      active: IDS.activeCourse,
      expired: IDS.expiredCourse,
      future: IDS.futureCourse,
      renewal: IDS.renewalCourse,
      cap: IDS.capCourse,
    },
  };
}
