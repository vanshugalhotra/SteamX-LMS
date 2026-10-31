// TODO: these mirror the backend DTOs by hand. Generate them from Swagger
// (or share a typed API client) so they cannot drift.
import type { AssetFileStatus, AssetType } from '../../../assets/model/types';
import type { ContentStatus } from '@/lib/content-status';

export type LessonAudience = 'TEACHER_ONLY' | 'STUDENT';

export interface Lesson {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  position: number;
  status: ContentStatus;
  audience: LessonAudience;
  createdAt: string;
  updatedAt: string;
}

export interface LessonListParams {
  moduleId: string;
}

export interface CreateLessonPayload {
  title: string;
  audience?: LessonAudience;
}

export interface UpdateLessonPayload {
  title?: string;
  audience?: LessonAudience;
}

export interface ReorderLessonsPayload {
  lessonIds: string[];
}

export type BlockType = 'RICH_TEXT' | 'IMAGE' | 'VIDEO' | 'PDF' | 'ACCORDION' | 'TWO_COLUMN';

export interface LessonContentBlock {
  id: string;
  type: BlockType;
  assetId?: string;
  content: Record<string, unknown>;
  columns?: [LessonContentBlock | null, LessonContentBlock | null];
}

export interface LessonContentAssetFile {
  status: AssetFileStatus;
  mimeType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
  lastError: string | null;
}

export interface LessonContentAsset {
  id: string;
  type: AssetType;
  title: string;
  status: ContentStatus;
  file: LessonContentAssetFile | null;
}

export interface LessonContent {
  version: number;
  blocks: LessonContentBlock[];
  assets: Record<string, LessonContentAsset>;
}

export interface SaveLessonContentPayload {
  expectedVersion: number;
  blocks: LessonContentBlock[];
}
