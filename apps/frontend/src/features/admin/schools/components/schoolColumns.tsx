import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { School } from '../model/types';
import { SchoolStatusBadge } from './SchoolStatusBadge';

export function getSchoolColumns(onEdit: (school: School) => void): DataTableColumn<School>[] {
  return [
    {
      key: 'school',
      header: 'School',
      width: '2fr',
      cell: (s) => (
        <>
          <p className="truncate text-[13px] font-semibold">{s.name}</p>
          <p className="truncate text-[11px] text-gray-600">{s.code}</p>
        </>
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
        <Button
          variant="secondary"
          size="sm"
          className="border border-gray-200 bg-white text-foreground hover:bg-gray-100"
          onClick={() => {
            onEdit(s);
          }}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>
      ),
    },
  ];
}
