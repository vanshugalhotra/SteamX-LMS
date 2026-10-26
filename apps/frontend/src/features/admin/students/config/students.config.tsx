import { Pencil } from 'lucide-react';
import type { FieldConfig } from '@/components/form/FormRenderer';
import type { FormSectionAccent } from '@/components/form/FormSection';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { useClassSectionSearch } from '../../class-sections/queries';
import { useSchoolSearch } from '../../schools/queries';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import type { UserListItem, UserStatusFilter } from '../../users/model/types';
import type { StudentFormValues } from '../model/schemas';

export const STUDENTS_PAGE_SIZE = 10;

/** Backend limit for the `q` search param (UserListQueryDto). */
export const STUDENTS_SEARCH_MAX_LENGTH = 100;

export const STUDENT_STATUS_FILTERS: { value: UserStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All students' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export function getStudentColumns(
  schoolName: (schoolId: string | null) => string,
): DataTableColumn<UserListItem>[] {
  return [
    {
      key: 'student',
      header: 'Student',
      width: '2fr',
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarInitial name={s.name} seed={s.id} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{s.name}</p>
            <p className="truncate text-[11px] text-gray-600">{s.steamxId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'steamxId',
      header: 'SteamX ID',
      width: '1fr',
      mobileLabel: true,
      cell: (s) => <span className="truncate">{s.steamxId}</span>,
    },
    {
      key: 'school',
      header: 'School',
      width: '1.6fr',
      mobileLabel: true,
      cell: (s) => schoolName(s.schoolId),
    },
    {
      key: 'class',
      header: 'Class',
      width: '1fr',
      mobileLabel: true,
      // TODO: the users list does not return the class section (only GET /users/:id does).
      // Show it here once the backend adds it to the list item.
      cell: () => <span className="text-gray-600">-</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '.8fr',
      cell: (s) => <UserStatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (s) => (
        <ButtonLink
          to={PATHS.admin.studentEdit(s.id)}
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

export interface StudentFieldGroup {
  id: string;
  title: string;
  accent: FormSectionAccent;
  fields: FieldConfig<StudentFormValues>[];
}

export function getStudentFieldGroups(isEdit: boolean, classLabel = ''): StudentFieldGroup[] {
  return [
    {
      id: 'basic',
      title: 'Basic information',
      accent: 'coral',
      fields: [
        { name: 'name', label: 'Full name', required: true, width: 'half' },
        { name: 'guardianName', label: 'Guardian name', width: 'half', placeholder: 'Optional' },
      ],
    },
    {
      id: 'school',
      title: 'School and class',
      accent: 'teal',
      fields: [
        ...(isEdit
          ? ([
              {
                name: 'schoolName',
                label: 'School (cannot be changed)',
                readOnly: true,
                width: 'half',
              },
              {
                name: 'steamxId',
                label: 'SteamX ID (cannot be changed)',
                readOnly: true,
                width: 'half',
              },
            ] satisfies FieldConfig<StudentFormValues>[])
          : ([
              {
                name: 'schoolId',
                label: 'School',
                type: 'async-select',
                required: true,
                placeholder: 'Search schools by name or code',
                useSearch: useSchoolSearch,
              },
            ] satisfies FieldConfig<StudentFormValues>[])),
        // TODO: there is no UI to create class sections yet (only GET /class-sections
        // is wired in the admin frontend), so this is optional for now. Make it required
        // again once class sections can be created from the admin site.
        {
          name: 'classSectionId',
          label: 'Class section',
          type: 'async-select',
          placeholder: isEdit ? 'Search class sections' : 'Choose a school first',
          useSearch: useClassSectionSearch,
          dependsOn: 'schoolId',
          initialLabel: classLabel,
        },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      accent: 'yellow',
      // On edit this section holds the status control (rendered by the form).
      fields: isEdit
        ? []
        : [
            {
              name: 'password',
              label: 'Password',
              type: 'password',
              required: true,
              width: 'half',
            },
          ],
    },
  ];
}
