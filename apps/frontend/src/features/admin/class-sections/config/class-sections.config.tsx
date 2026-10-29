import { Pencil } from 'lucide-react';
import type { FieldConfig } from '@/components/form/FormRenderer';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { useSchoolSearch } from '../../schools/queries';
import { classSectionLabel, type ClassSection } from '../model/types';
import type { ClassSectionFormValues } from '../model/schemas';

export const CLASS_SECTIONS_PAGE_SIZE = 10;
export const CLASS_SECTIONS_SEARCH_MAX_LENGTH = 100;

export function getClassSectionFields(isEdit: boolean): FieldConfig<ClassSectionFormValues>[] {
  return [
    isEdit
      ? { name: 'schoolName', label: 'School (cannot be changed)', readOnly: true }
      : {
          name: 'schoolId',
          label: 'School',
          type: 'async-select',
          required: true,
          placeholder: 'Search schools by name or code',
          useSearch: useSchoolSearch,
        },
    {
      name: 'className',
      label: 'Class',
      required: true,
      width: 'half',
      placeholder: 'e.g. Grade 8',
    },
    {
      name: 'sectionName',
      label: 'Section',
      required: isEdit,
      width: 'half',
      placeholder: isEdit ? 'e.g. A' : 'Optional, e.g. A (default: All)',
    },
  ];
}

export function getClassSectionColumns(
  schoolName: (schoolId: string) => string,
): DataTableColumn<ClassSection>[] {
  return [
    {
      key: 'class',
      header: 'Class section',
      width: '2fr',
      cell: (c) => (
        <span className="truncate text-[13px] font-semibold">{classSectionLabel(c)}</span>
      ),
    },
    {
      key: 'school',
      header: 'School',
      width: '2fr',
      mobileLabel: true,
      cell: (c) => schoolName(c.schoolId),
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (c) => (
        <ButtonLink
          to={PATHS.admin.classSectionEdit(c.id)}
          variant="secondary"
          size="sm"
          className="border border-gray-200 bg-white text-foreground hover:bg-gray-100"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </ButtonLink>
      ),
    },
  ];
}
