import { useState } from 'react';
import { toast } from 'sonner';
import { AsyncSelect } from '@/components/ui/async-select';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useActiveTeacherSearch } from '@/features/admin/users/queries';
import { getErrorMessage } from '@/lib/api-errors';
import type { Delivery } from '../model/types';
import { getPageAfterRemoval } from '../model/rules';
import { DELIVERY_ASSIGNMENTS_PAGE_SIZE } from '../config/deliveries.config';
import { getDeliveryTeacherColumns } from '../config/delivery-teachers.config';
import { useAssignDeliveryTeacher, useDeliveryTeachers, useRemoveDeliveryTeacher } from '../queries';

export function DeliveryTeachersPanel({ delivery }: { delivery: Delivery }) {
  const [teacherId, setTeacherId] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const teachers = useDeliveryTeachers({
    deliveryId: delivery.id,
    page,
    limit: DELIVERY_ASSIGNMENTS_PAGE_SIZE,
  });
  const assignTeacher = useAssignDeliveryTeacher();
  const removeTeacher = useRemoveDeliveryTeacher();
  const pending = assignTeacher.isPending || removeTeacher.isPending;

  const assign = async () => {
    if (!teacherId) return;
    setActionError(null);
    try {
      await assignTeacher.mutateAsync({ deliveryId: delivery.id, teacherId });
      setTeacherId('');
      toast.success('Teacher assigned');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const remove = async (id: string) => {
    setActionError(null);
    const total = teachers.data?.total;
    try {
      await removeTeacher.mutateAsync({ deliveryId: delivery.id, teacherId: id });
      if (total !== undefined) {
        setPage((currentPage) =>
          getPageAfterRemoval(currentPage, total, DELIVERY_ASSIGNMENTS_PAGE_SIZE),
        );
      }
      toast.success('Teacher removed');
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const columns = getDeliveryTeacherColumns(
    (id) => void remove(id),
    pending,
    removeTeacher.isPending ? removeTeacher.variables.teacherId : null,
  );
  return (
    <div className="space-y-5">
      <section aria-label="Assign teacher" className="rounded-2xl bg-gray-50 p-4">
        <h2 className="text-sm font-semibold">Add a teacher</h2>
        {delivery.status === 'ACTIVE' ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <AsyncSelect
                aria-label="Search active teachers"
                value={teacherId}
                onChange={setTeacherId}
                useSearch={useActiveTeacherSearch}
                searchContext={delivery.schoolId}
                excludeValues={teachers.data?.items.map((teacher) => teacher.teacherId) ?? []}
                placeholder="Search teachers by name or SteamX ID"
                disabled={pending}
              />
            </div>
            <Button type="button" disabled={!teacherId || pending} onClick={() => void assign()}>
              {assignTeacher.isPending ? 'Assigning…' : 'Assign teacher'}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Inactive deliveries can&apos;t take new teachers.
          </p>
        )}
      </section>

      {actionError && <Alert>{actionError}</Alert>}

      <section aria-label="Assigned teachers" className="space-y-3">
        <h2 className="text-sm font-semibold">
          Assigned teachers{teachers.data ? ` (${String(teachers.data.total)})` : ''}
        </h2>
        <DataTable
          columns={columns}
          rows={teachers.data?.items}
          getRowId={(teacher) => teacher.id}
          isPending={teachers.isPending}
          isError={teachers.isError}
          onRetry={() => void teachers.refetch()}
          emptyMessage="No teachers assigned yet."
          errorMessage="We couldn't load assigned teachers."
          loadingLabel="Loading teachers"
        />
        {teachers.data && teachers.data.total > 0 && (
          <Pagination
            page={teachers.data.page}
            limit={teachers.data.limit}
            total={teachers.data.total}
            onPageChange={setPage}
          />
        )}
      </section>
    </div>
  );
}
