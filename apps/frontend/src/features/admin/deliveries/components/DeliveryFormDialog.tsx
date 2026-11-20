import { useState } from 'react';
import { useNativeDialog } from '@/components/ui/use-native-dialog';
import type { Delivery } from '../model/types';
import { DeliveryForm } from './DeliveryForm';

export function DeliveryFormDialog({
  delivery,
  onClose,
}: {
  delivery: Delivery;
  onClose: () => void;
}) {
  const { dialogRef } = useNativeDialog();
  const [busy, setBusy] = useState(false);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      aria-labelledby="delivery-form-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-3xl border border-gray-200 bg-white p-6 text-foreground shadow-2xl backdrop:bg-ink/40 sm:p-8"
    >
      <DeliveryForm
        mode="rename"
        delivery={delivery}
        onDone={onClose}
        onCancel={onClose}
        onBusyChange={setBusy}
      />
    </dialog>
  );
}
