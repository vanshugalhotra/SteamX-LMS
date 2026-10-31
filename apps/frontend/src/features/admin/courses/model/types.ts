// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
import type { ContentStatus } from '@/lib/content-status';
import type { LessonAudience } from '@/features/admin/modules/lessons/model/types';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CourseListParams {
  page: number;
  limit: number;
  q?: string;
  status?: ContentStatus;
}

export interface CreateCoursePayload {
  title: string;
  description?: string | null;
}

export interface UpdateCoursePayload {
  title?: string;
  description?: string | null;
}

export interface CourseOutlineLesson {
  id: string;
  title: string;
  position: number;
  status: ContentStatus;
  audience: LessonAudience;
}

export interface CourseOutlineModule {
  id: string;
  title: string;
  position: number;
  status: ContentStatus;
  lessons: CourseOutlineLesson[];
}

export interface CourseOutline {
  course: Pick<Course, 'id' | 'title' | 'description' | 'status'>;
  modules: CourseOutlineModule[];
}
