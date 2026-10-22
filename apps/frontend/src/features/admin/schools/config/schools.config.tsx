import { Pencil } from 'lucide-react';
import type { FieldConfig } from '@/components/form/FormRenderer';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import type { SchoolFormValues } from '../model/schemas';
import type { School, SchoolStatusFilter } from '../model/types';
import { AvatarInitial } from '@/components/ui/avatar-initial';
import type { FormSectionAccent } from '@/components/form/FormSection';

export const SCHOOLS_PAGE_SIZE = 10;
export const SCHOOLS_SEARCH_MAX_LENGTH = 120;

export interface SchoolFieldGroup {
  id: string;
  title: string;
  accent: FormSectionAccent;
  fields: FieldConfig<SchoolFormValues>[];
}

export const SCHOOL_STATUS_FILTERS: { value: SchoolStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export const schoolColumns: DataTableColumn<School>[] = [
  {
    key: 'school',
    header: 'School',
    width: '2fr',
    cell: (s) => (
      <div className="flex min-w-0 items-center gap-3">
        <AvatarInitial name={s.name} seed={s.id} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{s.name}</p>
          <p className="truncate text-[11px] text-gray-600">{s.code}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'location',
    header: 'Location',
    width: '1.4fr',
    mobileLabel: true,
    cell: (s) => `${s.city}, ${s.state}`,
  },
  {
    key: 'contact',
    header: 'Contact',
    width: '1.6fr',
    mobileLabel: true,
    cell: (s) => (
      <>
        <p className="truncate">{s.contactName ?? '-'}</p>
        <p className="truncate text-[11px] text-gray-600">
          {s.contactEmail ?? s.contactPhone ?? ''}
        </p>
      </>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: '.8fr',
    cell: (s) => <SchoolStatusBadge status={s.status} />,
  },
  {
    key: 'actions',
    header: '',
    width: 'auto',
    className: 'md:justify-self-end',
    cell: (s) => (
      <ButtonLink
        to={PATHS.admin.schoolEdit(s.id)}
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

export function getSchoolFieldGroups(isEdit: boolean): SchoolFieldGroup[] {
  return [
    {
      id: 'basic',
      title: 'Basic information',
      accent: 'coral',
      fields: [
        {
          name: 'name',
          label: 'School name',
          required: true,
          width: 'half',
          placeholder: 'e.g. Greenfield Public School',
        },
        {
          name: 'code',
          label: isEdit ? 'School code (cannot be changed)' : 'School code',
          required: !isEdit,
          readOnly: isEdit,
          width: 'half',
          autoCapitalize: 'characters',
          placeholder: 'e.g. GPS-JPR',
        },
      ],
    },
    {
      id: 'address',
      title: 'School address',
      accent: 'teal',
      fields: [
        { name: 'streetAddress', label: 'Street address', placeholder: 'Building, street, area' },
        { name: 'city', label: 'City', required: true, width: 'half' },
        { name: 'state', label: 'State', required: true, width: 'half' },
        { name: 'postalCode', label: 'Postal code', required: true, width: 'half' },
        { name: 'country', label: 'Country', required: true, width: 'half' },
      ],
    },
    {
      id: 'contact',
      title: 'Contact information',
      accent: 'yellow',
      fields: [
        { name: 'contactName', label: 'Contact person name', width: 'third' },
        {
          name: 'contactEmail',
          label: 'Contact email',
          type: 'email',
          width: 'third',
          placeholder: 'name@school.edu',
        },
        {
          name: 'contactPhone',
          label: 'Contact phone',
          type: 'tel',
          width: 'third',
          placeholder: '+91 98765 43210',
        },
      ],
    },
  ];
}
