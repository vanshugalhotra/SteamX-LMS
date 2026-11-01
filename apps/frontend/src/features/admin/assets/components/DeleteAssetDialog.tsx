import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DeleteAssetDialogProps {
  open: boolean;
  title: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteAssetDialog({
  open,
  title,
  pending,
  onConfirm,
  onCancel,
}: DeleteAssetDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Delete this asset?"
      description={`"${title}" will be permanently removed from the library. This can't be undone.`}
      confirmLabel="Delete asset"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
