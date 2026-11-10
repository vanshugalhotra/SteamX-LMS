import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNativeDialog } from '@/components/ui/use-native-dialog';
import type { Asset, AssetType } from '@/features/admin/assets/model/types';
import { useAssets } from '@/features/admin/assets/queries';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { describeFile } from './file-display';
import { ASSETS_SEARCH_MAX_LENGTH } from '@/features/admin/assets/config/assets.config';
import { AssetThumb } from './AssetThumb';

const PAGE_SIZE = 24;

export function AssetPickerDialog({
  assetType,
  label,
  onSelect,
  onClose,
}: {
  assetType: AssetType;
  label: string;
  onSelect: (asset: Asset) => void;
  onClose: () => void;
}) {
  const { dialogRef, close: closeDialog } = useNativeDialog();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Asset | null>(null);
  // The backend only accepts new references to ACTIVE assets with a READY file of this type.
  const assets = useAssets({
    page: 1,
    limit: PAGE_SIZE,
    type: assetType,
    status: 'ACTIVE',
    fileStatus: 'READY',
    search: useDebouncedValue(search.trim()),
  });

  const close = () => {
    if (dialogRef.current?.open) closeDialog();
    else onClose();
  };

  const items = assets.data?.items ?? [];
  const total = assets.data?.total ?? 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="asset-picker-title"
      className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-3xl border-0 bg-white p-6 text-brand-navy shadow-2xl backdrop:bg-ink/40"
    >
      <h2 id="asset-picker-title" className="text-lg font-semibold">
        Choose {label}
      </h2>
      <p className="mt-1 text-xs text-gray-600">
        Only active files that finished processing are shown.
      </p>
      <label htmlFor="asset-search" className="sr-only">
        Search by name
      </label>
      <Input
        id="asset-search"
        className="mt-4"
        placeholder="Search by name"
        autoComplete="off"
        autoFocus
        value={search}
        maxLength={ASSETS_SEARCH_MAX_LENGTH}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <div className="mt-4 min-h-40">
        {assets.error && <Alert>{getErrorMessage(assets.error)}</Alert>}
        {assets.isPending && (
          <p role="status" className="text-xs text-gray-600">
            Loading…
          </p>
        )}
        {assets.data && items.length === 0 && (
          <p className="py-10 text-center text-xs text-gray-600">
            No matching files. Upload one in the Asset Library first.
          </p>
        )}
        <ul className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {items.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                aria-pressed={selected?.id === asset.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-2xl border-[1.5px] border-brand-line p-3 text-left outline-none hover:bg-brand-side focus-visible:ring-2 focus-visible:ring-ring',
                  selected?.id === asset.id && 'border-primary ring-2 ring-primary/30',
                )}
                onClick={() => {
                  setSelected(asset);
                }}
              >
                <AssetThumb type={asset.type} mimeType={asset.file?.mimeType} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{asset.title}</span>
                  <span className="block truncate text-[11px] text-gray-600">
                    {describeFile(asset.file)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {total > items.length && (
          <p className="mt-2 text-[11px] text-gray-600">
            Showing {items.length} of {total}. Search to narrow the list.
          </p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <a
          href={PATHS.admin.assets}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand-navy underline"
        >
          Open Asset Library
        </a>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onSelect(selected);
              close();
            }}
          >
            Use {label}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
