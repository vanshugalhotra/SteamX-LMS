import { Badge } from '@/components/ui/badge';
import { FILE_STATUS_PRESENTATION } from '../config/assets.config';
import type { AssetDetail } from '../model/types';

export function AssetDetailHeader({ asset }: { asset: AssetDetail }) {
  const file = asset.file;
  return (
    <header className="min-w-0">
      <h1 className="truncate text-2xl font-semibold" title={asset.title}>
        {asset.title}
      </h1>
      <p className="mt-1 truncate text-xs text-gray-600">{file?.originalFilename ?? 'No file'}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {file ? (
          <Badge variant={FILE_STATUS_PRESENTATION[file.status].variant}>
            {FILE_STATUS_PRESENTATION[file.status].label}
          </Badge>
        ) : (
          <Badge variant="neutral">No file</Badge>
        )}
        <Badge variant={asset.status === 'ACTIVE' ? 'neutral' : 'warning'}>
          {asset.status === 'ACTIVE' ? 'Active' : 'Archived'}
        </Badge>
      </div>
    </header>
  );
}
