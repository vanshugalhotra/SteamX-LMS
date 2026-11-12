import type { FieldConfig } from '@/components/form/FormRenderer';
import { CONTENT_STATUS_PRESENTATION, type ContentStatus } from '@/lib/content-status';
import type { CourseFormValues } from '../model/schemas';
import type { CourseStatusFilter } from '../model/types';

export const COURSES_PAGE_SIZE = 6;
export const COURSES_SEARCH_MAX_LENGTH = 120;
export const COURSE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
] as const satisfies readonly ContentStatus[];

export const courseStatuses = {
  DRAFT: {
    ...CONTENT_STATUS_PRESENTATION.DRAFT,
    bannerClass: 'bg-brand-sun',
    description: 'Not visible to students. Build and review here.',
  },
  ACTIVE: {
    ...CONTENT_STATUS_PRESENTATION.ACTIVE,
    bannerClass: 'bg-brand-teal',
    description: 'Usable. Students see its active modules and lessons.',
  },
  ARCHIVED: {
    ...CONTENT_STATUS_PRESENTATION.ARCHIVED,
    bannerClass: 'bg-gray-200',
    description: 'Retired from new use. Released content stays until it expires.',
  },
} as const;

export const COURSE_STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  ...COURSE_STATUSES.map((value) => ({
    value,
    label: courseStatuses[value].label,
  })),
] satisfies { value: CourseStatusFilter; label: string }[];

export const courseFields: FieldConfig<CourseFormValues>[] = [
  {
    name: 'title',
    label: 'Course title',
    required: true,
    maxLength: 200,
    placeholder: 'e.g. Foundations of Robotics',
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    rows: 4,
    maxLength: 2000,
    placeholder: 'A short summary of what the course covers (optional)',
  },
];
