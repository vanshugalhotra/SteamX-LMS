import { Plus } from 'lucide-react';
import { HeaderSlot } from '@/features/admin/components/HeaderSlot';
import { ButtonLink } from '@/components/ui/button-link';
import { ListToolbar, SearchBox } from '@/components/list/ListToolbar';
import { PATHS } from '@/lib/paths';
import { useListParams } from '@/lib/use-list-params';
import { AssetGrid } from '../components/AssetGrid';
import {
  ASSET_STATUS_FILTERS,
  ASSET_TYPE_FILTERS,
  ASSETS_PAGE_SIZE,
  ASSETS_SEARCH_MAX_LENGTH,
  isAssetTypeFilter,
} from '../config/assets.config';
import type { AssetStatus } from '../model/types';
import { useAssets } from '../queries';

export function AssetsPage() {
  const {
    search,
    setSearch,
    filter: status,
    setFilter: setStatus,
    secondary: typeFilter,
    setSecondary: setTypeFilter,
    q,
    page,
    setPage,
  } = useListParams<AssetStatus>('ACTIVE');
  const selectedType = isAssetTypeFilter(typeFilter) ? typeFilter : 'ALL';
  const type = selectedType === 'ALL' ? undefined : selectedType;
  const { data, isPending, isError, refetch } = useAssets({
    page,
    limit: ASSETS_PAGE_SIZE,
    search: q,
    status,
    type,
  });

  return (
    <div className="space-y-6">
      <HeaderSlot>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search assets"
          label="Search assets by title"
          maxLength={ASSETS_SEARCH_MAX_LENGTH}
        />
      </HeaderSlot>

      <section className="relative flex min-h-48 flex-col justify-between overflow-hidden rounded-3xl bg-teal-500 p-6 text-gray-900 lg:p-8">
        <span
          aria-hidden="true"
          className="absolute -right-10 -top-12 size-48 rounded-full bg-coral-500"
        />
        <span
          aria-hidden="true"
          className="absolute right-28 top-14 hidden size-24 rounded-full bg-yellow-500 sm:block"
        />
        <div className="relative max-w-2xl self-start">
          <h1 className="text-2xl font-semibold">Asset Library</h1>
          <p className="mt-1 text-xs">
            Images, PDFs and videos used across courses. Only Ready assets can be added to lessons.
          </p>
        </div>
        <div className="relative mt-5 flex flex-wrap items-end justify-between gap-4">
          <dl>
            {/* TODO: Replace the filtered list total with library-wide status counts when the API supports them. */}
            <dt className="text-[11px] font-medium">Total</dt>
            <dd className="mt-1 text-2xl leading-none font-semibold" aria-live="polite">
              {data?.total.toLocaleString() ?? '—'}
            </dd>
          </dl>
          <ButtonLink
            to={PATHS.admin.assetUpload}
            className="rounded-full bg-gray-900 text-white hover:bg-gray-800"
          >
            <Plus className="size-4" aria-hidden="true" />
            Upload asset
          </ButtonLink>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ListToolbar
          filters={ASSET_TYPE_FILTERS}
          filter={selectedType}
          onFilterChange={setTypeFilter}
          filterLabel="Filter by asset type"
          variant="chips"
        />
        <ListToolbar
          variant="segmented"
          filters={ASSET_STATUS_FILTERS}
          filter={status}
          onFilterChange={setStatus}
          filterLabel="Filter by asset status (All statuses is not available)"
        />
      </div>

      <AssetGrid
        data={data}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        onPageChange={setPage}
      />
    </div>
  );
}
