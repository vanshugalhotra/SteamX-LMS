import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PATHS } from '@/lib/paths';
import {
  useDeleteAssetAction,
  useRenameAsset,
  useToggleAssetStatus,
} from '../hooks/use-asset-actions';
import { deleteBlockedReason, replaceBlockedReason } from '../model/asset-rules';
import type { AssetDetail } from '../model/types';
import { AssetActions } from './AssetActions';
import { AssetDetailHeader } from './AssetDetailHeader';
import { AssetInfoCards } from './AssetInfoCards';
import { AssetPreview } from './AssetPreview';
import { AssetUsageList } from './AssetUsageList';
import { DeleteAssetDialog } from './DeleteAssetDialog';
import { RenameAssetForm } from './RenameAssetForm';
import { ReplaceAssetFile } from './ReplaceAssetFile';

export function AssetDetailView({ asset }: { asset: AssetDetail }) {
  const navigate = useNavigate();
  const { renameAsset, renaming } = useRenameAsset();
  const { toggleStatus, statusPendingId } = useToggleAssetStatus();
  const { removeAsset, deleting } = useDeleteAssetAction();
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onDelete = async () => {
    if (await removeAsset(asset.id)) {
      void navigate(PATHS.admin.assets);
    } else {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to={PATHS.admin.assets}
        className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-gray-600 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Asset Library
      </Link>

      {renameOpen ? (
        <RenameAssetForm
          initialTitle={asset.title}
          pending={renaming}
          onSubmit={async (title) => {
            const message = await renameAsset(asset.id, title);
            if (!message) setRenameOpen(false);
            return message;
          }}
          onCancel={() => {
            setRenameOpen(false);
          }}
        />
      ) : (
        <AssetDetailHeader asset={asset} />
      )}

      <AssetPreview asset={asset} />
      <AssetInfoCards asset={asset} />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <AssetUsageList usedIn={asset.usedIn} />
        <section
          className="space-y-3 rounded-3xl bg-gray-50 p-5"
          aria-labelledby="asset-manage-title"
        >
          <h2 id="asset-manage-title" className="text-sm font-semibold">
            Manage this asset
          </h2>
          <AssetActions
            status={asset.status}
            statusPending={statusPendingId === asset.id}
            deleteBlockedReason={deleteBlockedReason({
              usedInTotal: asset.usedIn.total,
              fileStatus: asset.file?.status,
            })}
            replacementAction={
              <ReplaceAssetFile
                asset={{ id: asset.id, type: asset.type }}
                blockedReason={replaceBlockedReason(asset.file?.status, asset.type)}
              />
            }
            onRename={() => {
              setRenameOpen(true);
            }}
            onToggleStatus={() => {
              toggleStatus(asset);
            }}
            onDelete={() => {
              setConfirmDelete(true);
            }}
          />
        </section>
      </div>

      <DeleteAssetDialog
        open={confirmDelete}
        title={asset.title}
        pending={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => {
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
