import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { AssetDetailView } from '../components/AssetDetailView';
import { useAsset } from '../queries';

export function AssetDetailPage() {
  const { id = '' } = useParams();
  const { data: asset, isPending, error, refetch } = useAsset(id);

  if (isPending) {
    return (
      <div
        className="h-64 animate-pulse rounded-3xl bg-gray-100"
        role="status"
        aria-label="Loading asset"
      />
    );
  }
  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-3">
        <Alert>{notFound ? 'Asset not found.' : getErrorMessage(error)}</Alert>
        {!notFound && (
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  return <AssetDetailView key={asset.id} asset={asset} />;
}
