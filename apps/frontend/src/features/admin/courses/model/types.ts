// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
export type ContentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

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

export type LessonAudience = 'TEACHER_ONLY' | 'STUDENT';
