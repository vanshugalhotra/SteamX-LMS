import { useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ASSET_ACCEPT, formatAssetSize } from '../config/assets.config';
import { useAssetUpload } from '../hooks/use-asset-upload';
import type { AssetType } from '../model/types';

interface ReplaceAssetFileProps {
  asset: { id: string; type: AssetType };
  blockedReason: string | null;
}

export function ReplaceAssetFile({ asset, blockedReason }: ReplaceAssetFileProps) {
  const upload = useAssetUpload({ existingAsset: asset });
  const inputRef = useRef<HTMLInputElement>(null);
  const { phase, file, validatedFile } = upload;
  const working = phase === 'preparing' || phase === 'completing';

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    void upload.chooseFile(selected);
  };

  let body;
  if (blockedReason) {
    body = <p className="text-[11px] text-gray-600">{blockedReason}</p>;
  } else if (phase === 'ready') {
    body = (
      <div className="space-y-2" role="status">
        <p className="text-xs font-semibold">File replaced. The new file is live.</p>
        <Button size="sm" variant="secondary" onClick={upload.reset}>
          Done
        </Button>
      </div>
    );
  } else if (phase === 'uploading') {
    body = (
      <div className="space-y-2">
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={upload.progress}
          className="h-2 overflow-hidden rounded-full bg-gray-200"
        >
          <div
            className="h-full rounded-full bg-teal-500"
            style={{ width: `${String(upload.progress)}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-600">
          {upload.progress}% uploaded. The current file stays live.
        </p>
        <Button size="sm" variant="secondary" onClick={upload.cancelUpload}>
          Cancel
        </Button>
      </div>
    );
  } else if (working) {
    body = (
      <p className="text-xs text-gray-600" role="status">
        {phase === 'preparing' ? 'Preparing the upload…' : 'Verifying the new file…'}
      </p>
    );
  } else {
    body = (
      <div className="space-y-2">
        {upload.fileError && <Alert>{upload.fileError}</Alert>}
        {phase === 'failed' && upload.error && <Alert>{upload.error}</Alert>}
        {file && validatedFile && (
          <p className="truncate text-xs">
            {file.name} <span className="text-gray-600">({formatAssetSize(file.size)})</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {phase === 'failed' && upload.canRetry && (
            <Button size="sm" onClick={() => void upload.retryUpload()}>
              Retry
            </Button>
          )}
          {phase !== 'failed' && file && validatedFile && (
            <Button size="sm" onClick={() => void upload.startUpload()}>
              Replace file
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={upload.fileSelectionDisabled}
            onClick={() => inputRef.current?.click()}
          >
            {file ? 'Choose another file' : 'Choose replacement file'}
          </Button>
        </div>
        {upload.isValidating && <p className="text-[11px] text-gray-600">Checking the file…</p>}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-sm" aria-live="polite">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-100">
        <ArrowLeftRight className="size-4 text-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold">Replace file</h3>
        <p className="mt-0.5 mb-2 text-[11px] text-gray-600">
          {asset.type === 'PPTX'
            ? 'PPTX uploads are no longer supported.'
            : `Upload a new ${asset.type.toLowerCase()} file. The current file stays live until it is ready.`}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose replacement file"
          accept={ASSET_ACCEPT[asset.type]}
          onChange={onPick}
        />
        {body}
      </div>
    </div>
  );
}
