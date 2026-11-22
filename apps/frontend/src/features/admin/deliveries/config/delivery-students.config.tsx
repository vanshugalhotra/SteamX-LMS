import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { DeliveryEnrollment } from '../model/types';

export function getDeliveryEnrollmentColumns(
  onRemove: (studentId: string) => void,
  pending: boolean,
  removingId: string | null,
): DataTableColumn<DeliveryEnrollment>[] {
  return [
    {
      key: 'student',
      header: 'Student',
      width: '2fr',
      cell: (enrollment) => (
        <div>
          <p className="truncate text-sm font-semibold">{enrollment.name}</p>
          <p className="text-xs text-gray-600">{enrollment.steamxId}</p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      width: '1.5fr',
      mobileLabel: true,
      cell: (enrollment) =>
        `${enrollment.classSection.className} - ${enrollment.classSection.sectionName}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: '1fr',
      cell: () => <Badge variant="success">Enrolled</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (enrollment) => (
        <Button
          type="button"
          size="sm"
          variant="dangerOutline"
          disabled={pending}
          onClick={() => {
            onRemove(enrollment.studentId);
          }}
        >
          {removingId === enrollment.studentId ? 'Removing…' : 'Remove'}
        </Button>
      ),
    },
  ];
}
