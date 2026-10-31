// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
import type { ContentStatus } from '@/lib/content-status';

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  position: number;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CourseModuleListParams {
  courseId: string;
}

export interface CreateCourseModulePayload {
  title: string;
}

export interface UpdateCourseModulePayload {
  title?: string;
}

export interface ReorderCourseModulesPayload {
  moduleIds: string[];
}
