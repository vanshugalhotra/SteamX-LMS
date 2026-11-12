import { useRef, useState, type DragEvent, type SyntheticEvent } from 'react';
import { FileText, Image as ImageIcon, Upload, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PATHS } from '@/lib/paths';
import { formatAssetSize } from '../config/assets.config';
import { ASSET_UPLOAD_LIMITS, formatUploadLimit } from '../config/upload-validation';
import { useAssetUpload } from '../hooks/use-asset-upload';
import { UploadStepper } from './UploadStepper';

export function AssetUploadForm() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const {
    title,
    setTitle,
    file,
    validatedFile,
    fileError,
    isValidating,
    phase,
    progress,
    error,
    setError,
    retryStep,
    busy,
    fileSelectionDisabled,
    titleDisabled,
    canRetry,
    chooseFile,
    removeSelectedFile,
    startUpload,
    retryUpload,
    cancelUpload,
  } = useAssetUpload();

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (!fileSelectionDisabled) void chooseFile(event.dataTransfer.files[0]);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void startUpload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <UploadStepper
        phase={phase}
        progress={progress}
        fileName={file?.name ?? null}
        retryStep={retryStep}
      />

      <form
        className="min-w-0 space-y-4 rounded-3xl bg-gray-50 p-4 sm:p-6"
        noValidate
        onSubmit={submit}
      >
        {error && <Alert>{error}</Alert>}

        <div>
          <label htmlFor="asset-title" className="mb-1 block text-xs font-medium">
            Title *
          </label>
          <Input
            id="asset-title"
            value={title}
            maxLength={200}
            required
            disabled={titleDisabled}
            aria-invalid={Boolean(error && !title.trim())}
            onChange={(event) => {
              setTitle(event.target.value);
              if (error && event.target.value.trim()) setError(null);
            }}
            placeholder="Give this asset a title"
          />
        </div>

        <div>
          <p className="mb-1 block text-xs font-medium">File *</p>
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              if (!fileSelectionDisabled) {
                dragCounter.current += 1;
                setIsDragging(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragCounter.current = Math.max(0, dragCounter.current - 1);
              setIsDragging(dragCounter.current > 0);
            }}
            onDrop={handleDrop}
            className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed bg-white px-4 py-8 text-center outline-none transition-colors focus-within:ring-4 focus-within:ring-ring/40 ${
              isDragging ? 'border-teal-500 bg-teal-50' : 'border-gray-200'
            } ${fileSelectionDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <Upload className="mb-1 size-6 text-teal-600" aria-hidden="true" />
            <span className="text-sm font-medium">
              {isDragging ? 'Drop your file here' : 'Drag a file here or browse'}
            </span>
            <span className="text-[11px] text-gray-600">JPG, PNG, WebP, PDF or MP4.</span>
            <span className="text-[10px] text-gray-600">
              Images up to {formatUploadLimit(ASSET_UPLOAD_LIMITS.image)}, PDFs up to{' '}
              {formatUploadLimit(ASSET_UPLOAD_LIMITS.pdf)}, videos up to{' '}
              {formatUploadLimit(ASSET_UPLOAD_LIMITS.video)}.
            </span>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4"
              disabled={fileSelectionDisabled}
              aria-label="Choose an asset file"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>

          {fileError && (
            <p className="mt-2 text-xs font-medium text-danger" role="alert">
              {fileError}
            </p>
          )}

          {file && (
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-900">
                {validatedFile?.type === 'IMAGE' ? (
                  <ImageIcon className="size-5" aria-hidden="true" />
                ) : validatedFile?.type === 'VIDEO' ? (
                  <Video className="size-5" aria-hidden="true" />
                ) : (
                  <FileText className="size-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{file.name}</p>
                <p className="text-[11px] text-gray-600">
                  {formatAssetSize(file.size)}
                  {validatedFile && ` · ${validatedFile.mimeType}`}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Remove selected file"
                disabled={fileSelectionDisabled}
                onClick={() => {
                  removeSelectedFile();
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          {isValidating && (
            <p className="mt-2 text-xs text-gray-600" role="status">
              Checking file type and contents…
            </p>
          )}
        </div>

        {(phase === 'uploading' || phase === 'completing') && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="font-medium">
                {phase === 'uploading'
                  ? 'Uploading your file…'
                  : 'Checking and preparing your file…'}
              </p>
              {phase === 'uploading' && <span>{progress}%</span>}
            </div>
            {phase === 'uploading' ? (
              <div
                className="h-2 overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-label="File upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-teal-600 transition-[width]"
                  style={{ width: `${String(progress)}%` }}
                />
              </div>
            ) : (
              <p className="text-[11px] text-gray-600">
                The asset will appear in the library once it is Ready.
              </p>
            )}
          </div>
        )}

        {phase === 'ready' && (
          <Alert variant="success">Asset is ready and will be added to your library.</Alert>
        )}

        {canRetry && (
          <Button
            type="button"
            onClick={() => {
              void retryUpload();
            }}
            disabled={busy || !file || !validatedFile}
          >
            {retryStep === 'complete' ? 'Retry verification' : 'Retry upload'}
          </Button>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {phase === 'uploading' ? (
            <Button type="button" variant="secondary" onClick={cancelUpload}>
              Cancel upload
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="border border-gray-200 bg-white text-gray-900 hover:bg-gray-100"
              disabled={busy}
              onClick={() => void navigate(PATHS.admin.assets)}
            >
              Cancel
            </Button>
          )}
          {phase !== 'uploading' && phase !== 'failed' ? (
            <Button type="submit" disabled={busy || !file || !validatedFile}>
              {phase === 'preparing'
                ? 'Preparing…'
                : phase === 'completing'
                  ? 'Verifying…'
                  : phase === 'ready'
                    ? 'Ready'
                    : 'Upload asset'}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
