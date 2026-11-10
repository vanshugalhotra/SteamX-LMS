import { getAssetPresentation } from '@/features/admin/assets/config/assets.config';
import type { AssetType } from '@/features/admin/assets/model/types';
import { cn } from '@/lib/utils';

export function AssetThumb({
  type,
  mimeType,
  className,
}: {
  type: AssetType;
  mimeType: string | null | undefined;
  className?: string;
}) {
  const { icon: Icon, className: tone } = getAssetPresentation(type, mimeType);
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-xl', tone, className)}
    >
      <Icon className="size-5" />
    </span>
  );
}
