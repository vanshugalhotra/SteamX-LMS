import { useState } from 'react';
import { toast } from 'sonner';
import { AsyncSelect } from '@/components/ui/async-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useActiveStudentSearch } from '@/features/admin/users/queries';
import { getErrorMessage } from '@/lib/api-errors';
import type { Delivery } from '../model/types';
import { getDeliveryEnrollmentBlockReason, getPageAfterRemoval } from '../model/rules';
import { DELIVERY_ASSIGNMENTS_PAGE_SIZE } from '../config/deliveries.config';
import { getDeliveryEnrollmentColumns } from '../config/delivery-students.config';
import { useDeliveryEnrollments, useEnrollDeliveryStudents, useRemoveDeliveryStudent } from '../queries';

export function DeliveryStudentsPanel({ delivery }: { delivery: Delivery }) {
  const [studentId, setStudentId] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const enrollments = useDeliveryEnrollments({
    deliveryId: delivery.id,
    page,
    limit: DELIVERY_ASSIGNMENTS_PAGE_SIZE,
    status: 'ACTIVE',
  });
  const enrollStudents = useEnrollDeliveryStudents();
  const removeStudent = useRemoveDeliveryStudent();
  const pending = enrollStudents.isPending || removeStudent.isPending;
  const blockReason = getDeliveryEnrollmentBlockReason(delivery);
  const enrollLocked = blockReason !== null;

  const enroll = async () => {
    if (!studentId || enrollLocked) return;
    setActionError(null);
    try {
      const counts = await enrollStudents.mutateAsync({
        deliveryId: delivery.id,
        body: { studentIds: [studentId] },
      });
      setStudentId('');
      toast.success(
        counts.enrolled
          ? 'Student enrolled'
          : counts.reactivated
            ? 'Student re-enrolled'
            : 'Student is already enrolled',
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const remove = async (id: string) => {
    setActionError(null);
    const total = enrollments.data?.total;
    try {
      await removeStudent.mutateAsync({ deliveryId: delivery.id, studentId: id });
      if (total !== undefined) {
        setPage((currentPage) =>
          getPageAfterRemoval(currentPage, total, DELIVERY_ASSIGNMENTS_PAGE_SIZE),
        );
      }
      toast.success('Student removed');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const columns = getDeliveryEnrollmentColumns(
    (id) => void remove(id),
    pending,
    removeStudent.isPending ? removeStudent.variables.studentId : null,
  );
  return (
    <div className="space-y-5">
      {blockReason && <Alert>{blockReason}</Alert>}

      <section aria-label="Enroll student" className="rounded-2xl bg-gray-50 p-4">
        <h2 className="text-sm font-semibold">Add a student</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <AsyncSelect
              aria-label="Search active students"
              value={studentId}
              onChange={setStudentId}
              useSearch={useActiveStudentSearch}
              searchContext={delivery.schoolId}
              excludeValues={enrollments.data?.items.map((enrollment) => enrollment.studentId) ?? []}
              placeholder="Search students by name or SteamX ID"
              disabled={pending || enrollLocked}
            />
          </div>
          <Button
            type="button"
            disabled={!studentId || pending || enrollLocked}
            onClick={() => void enroll()}
          >
            {enrollStudents.isPending ? 'Enrolling…' : 'Enroll student'}
          </Button>
        </div>
      </section>

      {actionError && <Alert>{actionError}</Alert>}

      <section aria-label="Enrolled students" className="space-y-3">
        <h2 className="text-sm font-semibold">
          Enrolled students{enrollments.data ? ` (${String(enrollments.data.total)})` : ''}
        </h2>
        <DataTable
          columns={columns}
          rows={enrollments.data?.items}
          getRowId={(enrollment) => enrollment.id}
          isPending={enrollments.isPending}
          isError={enrollments.isError}
          onRetry={() => void enrollments.refetch()}
          emptyMessage="No students enrolled yet."
          errorMessage="We couldn't load enrolled students."
          loadingLabel="Loading students"
        />
        {enrollments.data && enrollments.data.total > 0 && (
          <Pagination
            page={enrollments.data.page}
            limit={enrollments.data.limit}
            total={enrollments.data.total}
            onPageChange={setPage}
          />
        )}
      </section>
    </div>
  );
}
