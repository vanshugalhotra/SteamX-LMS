import { useState } from 'react';
import { toast } from 'sonner';
import { ListToolbar } from '@/components/list/ListToolbar';
import { AsyncMultiSelect } from '@/components/ui/async-multi-select';
import type { AsyncOption } from '@/components/ui/async-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useActiveStudentSearch } from '@/features/admin/users/queries';
import { getErrorMessage } from '@/lib/api-errors';
import { useListParams } from '@/lib/use-list-params';
import type { Delivery } from '../model/types';
import { getDeliveryEnrollmentBlockReason, getPageAfterRemoval } from '../model/rules';
import { DELIVERY_ASSIGNMENTS_PAGE_SIZE } from '../config/deliveries.config';
import {
  DELIVERY_ENROLLMENT_STATUS_FILTERS,
  getDeliveryEnrollmentColumns,
  MAX_DELIVERY_ENROLLMENT_BATCH_SIZE,
  type DeliveryEnrollmentStatusFilter,
} from '../config/delivery-students.config';
import {
  useDeliveryEnrollments,
  useEnrollDeliveryStudents,
  useRemoveDeliveryStudent,
} from '../queries';

export function DeliveryStudentsPanel({ delivery }: { delivery: Delivery }) {
  const [selectedStudents, setSelectedStudents] = useState<AsyncOption[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    filter: statusFilter,
    setFilter: setStatusFilter,
    page,
    setPage,
  } = useListParams<DeliveryEnrollmentStatusFilter>('ACTIVE');
  const enrollments = useDeliveryEnrollments({
    deliveryId: delivery.id,
    page,
    limit: DELIVERY_ASSIGNMENTS_PAGE_SIZE,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });
  const enrollStudents = useEnrollDeliveryStudents();
  const removeStudent = useRemoveDeliveryStudent();
  const pending = enrollStudents.isPending || removeStudent.isPending;
  const blockReason = getDeliveryEnrollmentBlockReason(delivery);
  const enrollLocked = blockReason !== null;

  const enroll = async () => {
    if (
      selectedStudents.length === 0 ||
      selectedStudents.length > MAX_DELIVERY_ENROLLMENT_BATCH_SIZE ||
      pending ||
      enrollLocked
    ) {
      return;
    }
    setActionError(null);
    try {
      const counts = await enrollStudents.mutateAsync({
        deliveryId: delivery.id,
        body: { studentIds: selectedStudents.map((student) => student.value) },
      });
      setSelectedStudents([]);
      toast.success(
        `Enrollment results: ${String(counts.enrolled)} enrolled, ${String(counts.reactivated)} reactivated, ${String(counts.alreadyEnrolled)} already enrolled`,
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
        setPage(getPageAfterRemoval(page, total, DELIVERY_ASSIGNMENTS_PAGE_SIZE));
      }
      toast.success('Student removed');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const reactivate = async (id: string) => {
    if (enrollLocked) return;
    setActionError(null);
    try {
      const counts = await enrollStudents.mutateAsync({
        deliveryId: delivery.id,
        body: { studentIds: [id] },
      });
      toast.success(counts.reactivated ? 'Student reactivated' : 'Student is already active');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const columns = getDeliveryEnrollmentColumns(
    (id) => void remove(id),
    (id) => void reactivate(id),
    pending,
    removeStudent.isPending ? removeStudent.variables.studentId : null,
    enrollStudents.isPending ? enrollStudents.variables.body.studentIds[0] : null,
    enrollLocked,
  );
  return (
    <div className="space-y-5">
      {blockReason && <Alert>{blockReason}</Alert>}

      <section aria-label="Enroll students" className="rounded-2xl bg-gray-50 p-4">
        <h2 className="text-sm font-semibold">Add students</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <AsyncMultiSelect
              aria-label="Search active students"
              selectedLabel="Selected students"
              selectedOptions={selectedStudents}
              onChange={(options) => {
                setSelectedStudents(options);
                setActionError(null);
              }}
              useSearch={useActiveStudentSearch}
              searchContext={delivery.schoolId}
              excludeValues={
                enrollments.data?.items
                  .filter((enrollment) => enrollment.status === 'ACTIVE')
                  .map((enrollment) => enrollment.studentId) ?? []
              }
              maxSelected={MAX_DELIVERY_ENROLLMENT_BATCH_SIZE}
              placeholder="Search students by name or SteamX ID"
              disabled={pending || enrollLocked}
              disableRemove={pending}
            />
          </div>
          <Button
            type="button"
            disabled={
              selectedStudents.length === 0 ||
              selectedStudents.length > MAX_DELIVERY_ENROLLMENT_BATCH_SIZE ||
              pending ||
              enrollLocked
            }
            onClick={() => void enroll()}
          >
            {enrollStudents.isPending
              ? 'Enrolling…'
              : selectedStudents.length > 0
                ? `Enroll ${String(selectedStudents.length)} student${selectedStudents.length === 1 ? '' : 's'}`
                : 'Enroll students'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-600" aria-live="polite">
          {String(selectedStudents.length)} selected (maximum{' '}
          {String(MAX_DELIVERY_ENROLLMENT_BATCH_SIZE)}). Already-active students on the current
          roster page are excluded; other roster pages may contain more active enrollments.
        </p>
      </section>

      {actionError && <Alert>{actionError}</Alert>}

      <section aria-label="Enrolled students" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">
            Enrolled students{enrollments.data ? ` (${String(enrollments.data.total)})` : ''}
          </h2>
          <ListToolbar
            variant="segmented"
            filters={DELIVERY_ENROLLMENT_STATUS_FILTERS}
            filter={statusFilter}
            onFilterChange={(filter) => {
              setStatusFilter(filter);
              setActionError(null);
            }}
            filterLabel="Filter by enrollment status"
          />
        </div>
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
