import type { FieldConfig } from '@/components/form/FormRenderer';
import { useSchoolSearch } from '../../schools/queries';
import type { ClassSectionFormValues } from '../model/schemas';

export const CLASS_SECTION_FIELDS: FieldConfig<ClassSectionFormValues>[] = [
  {
    name: 'schoolId',
    label: 'School',
    type: 'async-select',
    required: true,
    placeholder: 'Search schools by name or code',
    useSearch: useSchoolSearch,
  },
  { name: 'className', label: 'Class', required: true, width: 'half', placeholder: 'e.g. Grade 8' },
  {
    name: 'sectionName',
    label: 'Section',
    width: 'half',
    placeholder: 'Optional, e.g. A (default: All)',
  },
];
