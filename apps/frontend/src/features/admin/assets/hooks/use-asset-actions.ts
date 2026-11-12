import { toast } from 'sonner';
import { getErrorMessage, getFieldErrors } from '@/lib/api-errors';
import { ASSET_ERRORS } from '../config/assets.config';
import { nextStatus } from '../model/asset-rules';
import type { Asset } from '../model/types';
import { useDeleteAsset, useUpdateAsset, useUpdateAssetStatus } from '../queries';

export function useToggleAssetStatus() {
  const mutation = useUpdateAssetStatus();

  const toggleStatus = (asset: Pick<Asset, 'id' | 'status'>) => {
    const status = nextStatus(asset.status);
    mutation.mutate(
      { id: asset.id, status },
      {
        onSuccess: () => {
          toast.success(status === 'ARCHIVED' ? 'Asset archived' : 'Asset unarchived');
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, ASSET_ERRORS), { id: 'asset-status-failed' });
        },
      },
    );
  };

  return { toggleStatus, statusPendingId: mutation.isPending ? mutation.variables.id : null };
}

export function useRenameAsset() {
  const mutation = useUpdateAsset();

  /** Resolves to an error message, or null when the title was saved. */
  const renameAsset = async (id: string, title: string): Promise<string | null> => {
    try {
      await mutation.mutateAsync({ id, body: { title } });
      toast.success('Asset renamed');
      return null;
    } catch (error) {
      const fieldErrors = getFieldErrors(error);
      if (Object.hasOwn(fieldErrors, 'title')) return fieldErrors.title;
      return getErrorMessage(error, ASSET_ERRORS);
    }
  };

  return { renameAsset, renaming: mutation.isPending };
}

export function useDeleteAssetAction() {
  const mutation = useDeleteAsset();

  /** Resolves to true when the asset is gone. */
  const removeAsset = async (id: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(id);
      toast.success('Asset deleted');
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, ASSET_ERRORS), { id: 'asset-delete-failed' });
      return false;
    }
  };

  return { removeAsset, deleting: mutation.isPending };
}
