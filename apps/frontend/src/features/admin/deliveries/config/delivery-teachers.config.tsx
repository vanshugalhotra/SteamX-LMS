import { Button } from '@/components/ui/button';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { DeliveryTeacher } from '../model/types';

export function getDeliveryTeacherColumns(
  onRemove: (teacherId: string) => void,
  pending: boolean,
  removingId: string | null,
): DataTableColumn<DeliveryTeacher>[] {
  return [
    {
      key: 'teacher',
      header: 'Teacher',
      width: '2fr',
      cell: (teacher) => (
        <div>
          <p className="truncate text-sm font-semibold">{teacher.name}</p>
          <p className="text-xs text-gray-600">{teacher.steamxId}</p>
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Assigned',
      width: '1fr',
      mobileLabel: true,
      cell: (teacher) => new Date(teacher.assignedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (teacher) => (
        <Button
          type="button"
          size="sm"
          variant="dangerOutline"
          disabled={pending}
          onClick={() => {
            onRemove(teacher.teacherId);
          }}
        >
          {removingId === teacher.teacherId ? 'Removing…' : 'Remove'}
        </Button>
      ),
    },
  ];
}
