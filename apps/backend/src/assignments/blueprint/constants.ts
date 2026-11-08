/** Shared assignment blueprint types, defaults, and server-owned limits. */
export const ASSIGNMENT_ITEM_TYPE = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  TEXT: 'TEXT',
  FILE_UPLOAD: 'FILE_UPLOAD',
} as const;

export type AssignmentItemType = (typeof ASSIGNMENT_ITEM_TYPE)[keyof typeof ASSIGNMENT_ITEM_TYPE];

export const FILE_UPLOAD_TYPE = {
  PDF: 'PDF',
  IMAGE: 'IMAGE',
  PRESENTATION: 'PRESENTATION',
} as const;

export type FileUploadType = (typeof FILE_UPLOAD_TYPE)[keyof typeof FILE_UPLOAD_TYPE];

export const RUBRIC_SIZE = 4;

export const DEFAULT_RUBRIC = [
  { name: 'Knowledge', description: null },
  { name: 'Thinking', description: null },
  { name: 'Application', description: null },
  { name: 'Communication', description: null },
] as const;

export const ASSIGNMENT_LIMITS = {
  maxItems: 50,
  promptMaxLength: 5000,
  options: {
    min: 2,
    max: 6,
    textMaxLength: 500,
  },
  rubric: {
    nameMaxLength: 60,
    descriptionMaxLength: 500,
  },
  text: {
    maxLength: 20000,
  },
  fileUpload: {
    minFiles: 1,
    maxFiles: 5,
    minSizeMb: 1,
    maxSizeMb: 25,
    allowedTypes: Object.values(FILE_UPLOAD_TYPE),
  },
} as const;

export interface AssignmentBlueprintOption {
  text: string;
  isCorrect: boolean;
}

export interface AssignmentBlueprintItem {
  type: AssignmentItemType;
  prompt: string;
  config?: {
    maxLength?: number;
    maxFiles?: number;
    maxSizeMb?: number;
    allowedTypes?: FileUploadType[];
  };
  options?: AssignmentBlueprintOption[];
}

export interface AssignmentRubricItem {
  name: string;
  description?: string | null;
}

export interface AssignmentBlueprint {
  items: AssignmentBlueprintItem[];
  rubric: AssignmentRubricItem[] | null;
  allowResubmission: boolean;
}
