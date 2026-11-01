import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import type { Paginated } from '@/lib/pagination';
import type { Asset } from '../model/types';
import { AssetCard } from './AssetCard';
import { useToggleAssetStatus } from '../hooks/use-asset-actions';

interface AssetGridProps {
  data: Paginated<Asset> | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}

function AssetGridSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading assets"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-64 animate-pulse rounded-3xl bg-gray-100" />
      ))}
    </div>
  );
}

export function AssetGrid({ data, isPending, isError, onRetry, onPageChange }: AssetGridProps) {
  const { toggleStatus, statusPendingId } = useToggleAssetStatus();

  if (isPending) return <AssetGridSkeleton />;

  if (isError) {
    return (
      <div className="space-y-3 rounded-2xl bg-gray-50 p-4">
        <Alert>We couldn&apos;t load the assets. Please try again.</Alert>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <p className="rounded-2xl bg-gray-50 p-8 text-center text-sm text-gray-600">
        No assets match your search and filters.
      </p>
    );
  }

  return (
    <section aria-label="Assets">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onToggleStatus={toggleStatus}
            statusPending={statusPendingId === asset.id}
          />
        ))}
      </div>
      <div className="mt-2 rounded-2xl bg-gray-50 pb-3">
        <Pagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          onPageChange={onPageChange}
        />
      </div>
    </section>
  );
}
