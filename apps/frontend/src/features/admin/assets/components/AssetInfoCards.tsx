import { formatAssetDate, formatAssetSize, getAssetPresentation } from '../config/assets.config';
import type { AssetDetail } from '../model/types';

export function AssetInfoCards({ asset }: { asset: AssetDetail }) {
  const items = [
    {
      label: 'Type',
      value: getAssetPresentation(asset.type, asset.file?.mimeType).label,
      detail:
        asset.type === 'IMAGE'
          ? 'Image'
          : asset.type === 'VIDEO'
            ? 'Video'
            : asset.type === 'PDF'
              ? 'PDF document'
              : 'PowerPoint',
      className: 'bg-teal-500',
    },
    {
      label: 'Size',
      value: formatAssetSize(asset.file?.sizeBytes ?? null),
      detail: 'File size',
      className: 'bg-yellow-500',
    },
    {
      label: 'Uploaded',
      value: formatAssetDate(asset.file?.createdAt ?? asset.createdAt),
      detail: 'Upload date',
      className: 'bg-magenta-300',
    },
    {
      label: 'Lessons using it',
      value: String(asset.usedIn.total),
      detail: asset.usedIn.total > 0 ? 'Can’t be deleted while in use' : 'Not used in lessons',
      className: 'bg-gray-50',
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="File information">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex min-h-28 flex-col rounded-2xl p-4 ${item.className}`}
        >
          <dd className="text-xl leading-tight font-semibold">{item.value}</dd>
          <dt className="mt-0.5 text-[11px] font-medium">{item.label}</dt>
          <p className="mt-auto pt-2 text-[10px]">{item.detail}</p>
        </div>
      ))}
    </dl>
  );
}
