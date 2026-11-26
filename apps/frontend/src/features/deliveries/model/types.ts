export type DeliveryStatus = 'ACTIVE' | 'INACTIVE';

export interface Delivery {
  id: string;
  schoolId: string;
  course: {
    id: string;
    title: string;
  };
  label: string;
  academicYear: string;
  status: DeliveryStatus;
  displayName: string;
  subscriptionActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryListParams {
  page: number;
  limit: number;
  schoolId?: string;
  courseId?: string;
  academicYear?: string;
  status?: DeliveryStatus;
}

export type ReleaseLessonAudience = 'TEACHER_ONLY' | 'STUDENT';
export type ModuleReleaseState = 'NONE' | 'PARTIAL' | 'ALL';

export interface ReleaseLesson {
  id: string;
  title: string;
  position: number;
  audience: ReleaseLessonAudience;
  released: boolean;
  releasedAt: string | null;
  releasable: boolean;
}

export interface ReleaseModule {
  id: string;
  title: string;
  position: number;
  releaseState: ModuleReleaseState;
  releasedCount: number;
  releasableLessonCount: number;
  lessons: ReleaseLesson[];
}

export interface ReleaseOutlineResponse {
  modules: ReleaseModule[];
}

export interface LessonReleaseResponse {
  lessonId: string;
  released: boolean;
  releasedAt: string;
}

export interface ModuleReleaseResponse {
  moduleId: string;
  newlyReleased: number;
  alreadyReleased: number;
  skippedNotReleasable: number;
}
