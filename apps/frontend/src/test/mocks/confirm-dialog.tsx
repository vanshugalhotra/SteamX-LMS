import { Button } from '@/components/ui/button';

interface ConfirmDialogMockProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function ConfirmDialogMock({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
}: ConfirmDialogMockProps) {
  if (!open) return null;

  return (
    <>
      {title && <p>{title}</p>}
      {description && <p>{description}</p>}
      <Button type="button" onClick={onConfirm}>
        Confirm {confirmLabel}
      </Button>
    </>
  );
}
