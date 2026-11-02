import type { FieldConfig } from '@/components/form/FormRenderer';
import type { CourseFormValues } from '../model/schemas';
import type { CourseStatusFilter } from '../model/types';

export const COURSES_PAGE_SIZE = 6;
export const COURSES_SEARCH_MAX_LENGTH = 120;

export const courseStatuses = {
  DRAFT: {
    label: 'Draft',
    badgeVariant: 'warning',
    bannerClass: 'bg-yellow-400',
    description: 'Not visible to students. Build and review here.',
  },
  ACTIVE: {
    label: 'Active',
    badgeVariant: 'success',
    bannerClass: 'bg-teal-500',
    description: 'Usable. Students see its active modules and lessons.',
  },
  ARCHIVED: {
    label: 'Archived',
    badgeVariant: 'neutral',
    bannerClass: 'bg-gray-200',
    description: 'Retired from new use. Released content stays until it expires.',
  },
} as const;

export const COURSE_STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  ...(['DRAFT', 'ACTIVE', 'ARCHIVED'] as const).map((value) => ({
    value,
    label: courseStatuses[value].label,
  })),
] satisfies { value: CourseStatusFilter; label: string }[];

export const courseCreationStatuses = [
  {
    value: 'DRAFT',
    label: 'Draft',
    description: 'Hidden from students while you build it.',
  },
  {
    value: 'ACTIVE',
    label: 'Active',
    description: 'Ready to use for subscriptions.',
  },
] as const;

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
