import { Pencil } from 'lucide-react';
import type { FieldConfig } from '@/components/form/FormRenderer';
import { ButtonLink } from '@/components/ui/button-link';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PATHS } from '@/lib/paths';
import { SchoolStatusBadge } from '../components/SchoolStatusBadge';
import type { SchoolFormValues } from '../model/schemas';
import type { School, SchoolStatusFilter } from '../model/types';
import { AvatarInitial } from '@/components/ui/avatar-initial';

export const SCHOOLS_PAGE_SIZE = 10;

// TODO: these are the school's own ACTIVE/INACTIVE statuses. The design's filters
// (Active, Expiring soon, Expired, Revoked) are subscription statuses; replace these once
// the subscription API exists.
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

export function getSchoolFields(isEdit: boolean): FieldConfig<SchoolFormValues>[] {
  return [
    { name: 'name', label: 'School name', required: true, placeholder: 'e.g. ABC School' },
    {
      name: 'code',
      label: isEdit ? 'School code (cannot be changed)' : 'School code',
      required: !isEdit,
      readOnly: isEdit,
      autoCapitalize: 'characters',
      placeholder: 'e.g. AB-12',
    },
    { name: 'city', label: 'City', required: true, width: 'half', placeholder: 'e.g. Toronto' },
    { name: 'state', label: 'State', required: true, width: 'half', placeholder: 'e.g. BC' },
    {
      name: 'postalCode',
      label: 'Postal code',
      required: true,
      width: 'half',
      placeholder: 'e.g. 151204',
    },
    {
      name: 'country',
      label: 'Country',
      required: true,
      width: 'half',
      placeholder: 'e.g. Canada',
    },
    { name: 'streetAddress', label: 'Street address', placeholder: 'Optional' },
    { name: 'contactName', label: 'Contact name', width: 'half', placeholder: 'Optional' },
    {
      name: 'contactPhone',
      label: 'Contact phone',
      type: 'tel',
      width: 'half',
      placeholder: 'Optional',
    },
    {
      name: 'contactEmail',
      label: 'Contact email',
      type: 'email',
      placeholder: 'name@school.edu',
    },
  ];
}
