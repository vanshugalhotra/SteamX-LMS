import type { FilterOption } from '@/components/list/ListToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { DeliveryEnrollment, DeliveryEnrollmentStatus } from '../model/types';

export type DeliveryEnrollmentStatusFilter = DeliveryEnrollmentStatus | 'ALL';

export const DELIVERY_ENROLLMENT_STATUS_FILTERS: FilterOption<DeliveryEnrollmentStatusFilter>[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'REMOVED', label: 'Removed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ALL', label: 'All' },
];

const ENROLLMENT_STATUS_LABELS = {
  ACTIVE: 'Active',
  REMOVED: 'Removed',
  COMPLETED: 'Completed',
} as const;
const ENROLLMENT_STATUS_VARIANTS = {
  ACTIVE: 'success',
  REMOVED: 'warning',
  COMPLETED: 'neutral',
} as const;

export function getDeliveryEnrollmentColumns(
  onRemove: (studentId: string) => void,
  onReactivate: (studentId: string) => void,
  pending: boolean,
  removingId: string | null,
  reactivatingId: string | null,
  enrollmentWritesBlocked: boolean,
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
      cell: (enrollment) => {
        return (
          <Badge variant={ENROLLMENT_STATUS_VARIANTS[enrollment.status]}>
            {ENROLLMENT_STATUS_LABELS[enrollment.status]}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: 'auto',
      className: 'md:justify-self-end',
      cell: (enrollment) =>
        enrollment.status === 'ACTIVE' ? (
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
        ) : (
          <div className="space-y-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || enrollmentWritesBlocked}
              onClick={() => {
                onReactivate(enrollment.studentId);
              }}
            >
              {reactivatingId === enrollment.studentId ? 'Reactivating…' : 'Reactivate'}
            </Button>
            {enrollment.status === 'COMPLETED' && (
              <p className="text-[11px] text-gray-600">
                Completed enrollments can&apos;t be removed.
              </p>
            )}
          </div>
        ),
    },
  ];
}
