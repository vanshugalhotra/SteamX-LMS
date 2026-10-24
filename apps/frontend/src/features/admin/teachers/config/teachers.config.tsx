import { Pencil } from 'lucide-react';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { UserStatusBadge } from '../../users/components/UserStatusBadge';
import type { UserListItem, UserStatusFilter } from '../../users/model/types';
import type { FieldConfig } from '@/components/form/FormRenderer';
import type { FormSectionAccent } from '@/components/form/FormSection';
import type { TeacherFormValues } from '../model/schemas';
import { useSchoolSearch } from '../../schools/queries';

export const TEACHERS_PAGE_SIZE = 10;

/** Backend limit for the `q` search param (UserListQueryDto). */
export const TEACHERS_SEARCH_MAX_LENGTH = 100;

export const TEACHER_STATUS_FILTERS: { value: UserStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All teachers' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export interface TeacherFieldGroup {
  id: string;
  title: string;
  accent: FormSectionAccent;
  fields: FieldConfig<TeacherFormValues>[];
}

export function getTeacherColumns(
  schoolName: (schoolId: string | null) => string,
): DataTableColumn<UserListItem>[] {
  return [
    {
      key: 'teacher',
      header: 'Teacher',
      width: '2fr',
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarInitial name={t.name} seed={t.id} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{t.name}</p>
            <p className="truncate text-[11px] text-gray-600">{t.steamxId}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'steamxId',
      header: 'SteamX ID',
      width: '1.5fr',
      mobileLabel: true,
      cell: (t) => <span className="truncate">{t.steamxId}</span>,
    },
    {
      key: 'school',
      header: 'School',
      width: '1.6fr',
      mobileLabel: true,
      cell: (t) => schoolName(t.schoolId),
    },
    {
      key: 'assignment',
      header: 'Primary assignment',
      width: '1.4fr',
      mobileLabel: true,
      // TODO: the users list does not return `primaryAssignment` (only GET /users/:id does).
      // Show it here once the backend adds it to the list item.
      cell: () => <span className="text-gray-600">-</span>,
    },
    {
      key: 'email',
      header: 'Email',
      width: '1.6fr',
      mobileLabel: true,
      cell: (t) => <span className="truncate">{t.email ?? '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '.8fr',
      cell: (t) => <UserStatusBadge status={t.status} />,
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (t) => (
        <ButtonLink
          to={PATHS.admin.teacherEdit(t.id)}
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

export function getTeacherFieldGroups(isEdit: boolean): TeacherFieldGroup[] {
  return [
    {
      id: 'basic',
      title: 'Basic information',
      accent: 'coral',
      fields: [
        { name: 'name', label: 'Full name', required: true, width: 'half' },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          width: 'half',
          placeholder: 'name@school.edu',
        },
        {
          name: 'primaryAssignment',
          label: 'Primary assignment',
          placeholder: 'Optional, e.g. Grade 8 Science',
        },
      ],
    },
    {
      id: 'school',
      title: 'School',
      accent: 'teal',
      fields: isEdit
        ? [
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
          ]
        : [
            {
              name: 'schoolId',
              label: 'School',
              type: 'async-select',
              required: true,
              placeholder: 'Search schools by name or code',
              useSearch: useSchoolSearch,
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
