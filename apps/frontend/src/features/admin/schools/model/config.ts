import type { SchoolStatusFilter } from './types';
import type { FieldConfig } from '@/components/form/FormRenderer';
import type { SchoolFormValues } from './schemas';

export const SCHOOLS_PAGE_SIZE = 10;

// TODO: replace with subscription filters (Active, Expiring soon, Expired, Revoked) once the API supports it.
export const SCHOOL_STATUS_FILTERS: { value: SchoolStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export function getSchoolFields(isEdit: boolean): FieldConfig<SchoolFormValues>[] {
  return [
    { name: 'name', label: 'School name', required: true, placeholder: 'e.g. DAV School' },
    {
      name: 'code',
      label: isEdit ? 'School code (cannot be changed)' : 'School code',
      required: !isEdit,
      readOnly: isEdit,
      autoCapitalize: 'characters',
      placeholder: 'e.g. AB-12',
    },
    { name: 'city', label: 'City', required: true, width: 'half', placeholder: 'e.g. Kotkapura' },
    { name: 'state', label: 'State', required: true, width: 'half', placeholder: 'e.g. Punjab' },
    {
      name: 'postalCode',
      label: 'Postal code',
      required: true,
      width: 'half',
      placeholder: 'e.g. 151204',
    },
    { name: 'country', label: 'Country', required: true, width: 'half', placeholder: 'e.g. India' },
    { name: 'streetAddress', label: 'Street address', placeholder: 'Optional' },
    { name: 'contactName', label: 'Contact name', width: 'half', placeholder: 'Optional' },
    {
      name: 'contactPhone',
      label: 'Contact phone',
      type: 'tel',
      width: 'half',
      placeholder: 'Optional',
    },
    { name: 'contactEmail', label: 'Contact email', type: 'email', placeholder: 'name@school.edu' },
  ];
}
