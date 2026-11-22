import { useState } from 'react';
import { CirclePause, CirclePlay, Pencil, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/ui/action-menu';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ButtonLink } from '@/components/ui/button-link';
import { getCourseAccent } from '@/features/admin/courses/config/course-accent';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { DeliveryFormDialog } from './DeliveryFormDialog';
import { useUpdateDeliveryStatus } from '../queries';
import type { Delivery } from '../model/types';

interface DeliveryCardProps {
  delivery: Delivery;
  schoolName: string;
}

export function DeliveryCard({ delivery, schoolName }: DeliveryCardProps) {
  const updateStatus = useUpdateDeliveryStatus();
  const [renaming, setRenaming] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const nextStatus = delivery.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const changeStatus = async () => {
    setStatusError(null);
    try {
      await updateStatus.mutateAsync({ id: delivery.id, status: nextStatus });
      setConfirmStatus(false);
      toast.success(`Delivery ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      setConfirmStatus(false);
      setStatusError(getErrorMessage(error));
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <div
        className={`relative grid min-h-36 place-items-center overflow-hidden p-4 text-center ${getCourseAccent(delivery.course.id)}`}
      >
        <span
          aria-hidden="true"
          className="absolute -left-5 top-8 size-20 rounded-full bg-white/25"
        />
        <span
          aria-hidden="true"
          className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20"
        />
        <div className="relative">
          <UsersRound className="mx-auto size-9" aria-hidden="true" />
          <p className="mt-3 text-xs font-semibold">
            {delivery.label} · {delivery.academicYear}
          </p>
        </div>
        <div className="absolute right-3 top-3">
          <ActionMenu
            label={`Actions for ${delivery.displayName}`}
            actions={[
              {
                label: 'Rename',
                icon: Pencil,
                onSelect: () => {
                  setRenaming(true);
                },
              },
              {
                label: nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate',
                icon: nextStatus === 'ACTIVE' ? CirclePlay : CirclePause,
                disabled: updateStatus.isPending,
                onSelect: () => {
                  setStatusError(null);
                  setConfirmStatus(true);
                },
              },
            ]}
          />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">{delivery.course.title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-gray-600">{schoolName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={delivery.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {delivery.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant={delivery.subscriptionActive ? 'success' : 'warning'}>
            {delivery.subscriptionActive ? 'Subscription active' : 'Subscription inactive'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <ButtonLink
            to={PATHS.admin.deliveryTeachers(delivery.id)}
            variant="secondary"
            size="sm"
            className="flex-1"
          >
            Teachers
          </ButtonLink>
          <ButtonLink
            to={PATHS.admin.deliveryStudents(delivery.id)}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Students
          </ButtonLink>
        </div>
        {statusError && <Alert>{statusError}</Alert>}
      </div>
      {renaming && (
        <DeliveryFormDialog
          delivery={delivery}
          onClose={() => {
            setRenaming(false);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmStatus}
        title={`${nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} delivery?`}
        description={
          nextStatus === 'ACTIVE'
            ? 'Activating requires an active course, a current subscription, and available delivery capacity.'
            : `Students will no longer have access to ${delivery.displayName}.`
        }
        confirmLabel={nextStatus === 'ACTIVE' ? 'Activate delivery' : 'Deactivate delivery'}
        pending={updateStatus.isPending}
        pendingLabel="Updating…"
        onConfirm={() => {
          void changeStatus();
        }}
        onCancel={() => {
          if (!updateStatus.isPending) setConfirmStatus(false);
        }}
      />
    </article>
  );
}
