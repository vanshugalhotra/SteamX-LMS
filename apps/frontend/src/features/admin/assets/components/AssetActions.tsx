import { Archive, ArchiveRestore, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { statusActionLabel } from '../model/asset-rules';
import type { AssetStatus } from '../model/types';

interface ActionRowProps {
  icon: LucideIcon;
  label: string;
  description: string;
  disabled?: boolean;
  describedBy?: string;
  danger?: boolean;
  onClick: () => void;
}

function ActionRow({
  icon: Icon,
  label,
  description,
  disabled,
  describedBy,
  danger,
  onClick,
}: ActionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        danger && 'text-danger',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] font-normal text-gray-600">{description}</span>
      </span>
    </button>
  );
}

interface AssetActionsProps {
  status: AssetStatus;
  statusPending: boolean;
  deleteBlockedReason: string | null;
  replacementAction: ReactNode;
  onRename: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

export function AssetActions({
  status,
  statusPending,
  deleteBlockedReason,
  replacementAction,
  onRename,
  onToggleStatus,
  onDelete,
}: AssetActionsProps) {
  const archived = status === 'ARCHIVED';

  return (
    <div className="space-y-2">
      <ActionRow
        icon={Pencil}
        label="Rename"
        description="Change the title shown in the library"
        onClick={onRename}
      />
      {replacementAction}
      <ActionRow
        icon={archived ? ArchiveRestore : Archive}
        label={statusActionLabel(status)}
        description={
          archived
            ? 'Make it available for new lessons again'
            : 'Stop it being added to new lessons'
        }
        disabled={statusPending}
        onClick={onToggleStatus}
      />
      <ActionRow
        icon={Trash2}
        label="Delete"
        description="Permanently remove this asset"
        danger
        disabled={deleteBlockedReason !== null}
        describedBy={deleteBlockedReason ? 'asset-delete-reason' : undefined}
        onClick={onDelete}
      />
      {deleteBlockedReason && (
        <p
          id="asset-delete-reason"
          className="rounded-2xl bg-danger-soft p-3 text-[11px] font-medium text-danger"
        >
          {deleteBlockedReason}
        </p>
      )}
    </div>
  );
}
