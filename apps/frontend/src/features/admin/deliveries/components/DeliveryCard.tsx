import { useState } from 'react';
import { CirclePause, CirclePlay, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/ui/action-menu';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ButtonLink } from '@/components/ui/button-link';
import { DeliveryCardArtwork } from '@/features/deliveries/components/DeliveryCardArtwork';
import { DeliveryStatusBadges } from '@/features/deliveries/components/DeliveryStatusBadges';
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
      <DeliveryCardArtwork delivery={delivery}>
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
      </DeliveryCardArtwork>
      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">{delivery.course.title}</h2>
          <p className="mt-0.5 truncate text-[11px] text-gray-600">{schoolName}</p>
        </div>
        <DeliveryStatusBadges
          status={delivery.status}
          subscriptionActive={delivery.subscriptionActive}
        />
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
