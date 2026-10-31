import { useEffect, useRef, useState, type DragEvent, type SyntheticEvent } from 'react';
import { Check, FileText, Image as ImageIcon, Upload, Video, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { AssetPutError, putAssetFile } from '../api/put-asset-file';
import {
  ASSET_UPLOAD_LIMITS,
  AssetUploadValidationError,
  formatUploadLimit,
  validateAssetUploadFile,
  type ValidatedAssetFile,
} from '../config/upload-validation';
import type { AssetFile, AssetUploadRequest } from '../model/types';
import { useCompleteAssetFileUpload, useCreateAsset, useRequestAssetFileUpload } from '../queries';

type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'completing' | 'ready' | 'failed';
type RetryStep = 'create' | 'replace' | 'complete';

const UPLOAD_STEPS = [
  { title: 'Choose file', description: 'JPG, PNG, WebP, PDF or MP4' },
  { title: 'Uploading', description: 'Sending your file directly to storage' },
  { title: 'Processing', description: 'Checking and preparing it' },
  { title: 'Ready', description: 'Available in the asset library' },
];

const UPLOAD_FAILURE_MESSAGES: Record<string, string> = {
  SIZE_MISMATCH: 'The uploaded file size did not match the selected file.',
  FILE_TOO_LARGE: 'The uploaded file exceeds the allowed size.',
  TYPE_MISMATCH: 'The uploaded file type did not match the selected file.',
  CONTENT_NOT_RECOGNIZED: 'The file contents could not be verified as the selected file type.',
  ASSET_TYPE_NOT_SUPPORTED: 'This file type is not supported.',
  PROCESSING_FAILED: 'The file uploaded, but could not be processed.',
};

function getFileFailureMessage(file: AssetFile): string {
  return (
    UPLOAD_FAILURE_MESSAGES[file.lastError ?? ''] ??
    'The file could not be verified. Choose the file again or retry the upload.'
  );
}

function getPutFailureMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Upload canceled. Retry to request a fresh upload link.';
  }
  if (error instanceof AssetPutError) {
    if (error.status === 403) {
      return 'The upload link may have expired. Retry to request a fresh link.';
    }
    if (error.status === 412) {
      return 'This upload link has already been used. Retry to request a fresh link.';
    }
    if (error.status !== undefined) {
      return `The storage service rejected the upload (HTTP ${String(error.status)}). Retry for a fresh upload link.`;
    }
    return `${error.message} Check your connection and retry for a fresh upload link.`;
  }
  return 'The upload could not be completed. Retry to request a fresh upload link.';
}

function formatFileSize(size: number): string {
  if (size < 1_000) return `${String(size)} B`;
  if (size < 1_000_000) return `${String(Math.round(size / 1_000))} KB`;
  if (size < 1_000_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function AssetUploadForm() {
  const navigate = useNavigate();
  const createAsset = useCreateAsset();
  const requestFile = useRequestAssetFileUpload();
  const completeFile = useCompleteAssetFileUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const putTask = useRef<{ abort: () => void } | null>(null);
  const readyTimeout = useRef<number | null>(null);
  const validationRun = useRef(0);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedAssetFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryStep, setRetryStep] = useState<RetryStep>('create');
  const [uploadRequest, setUploadRequest] = useState<AssetUploadRequest | null>(null);

  const busy =
    isValidating ||
    phase === 'preparing' ||
    phase === 'uploading' ||
    phase === 'completing' ||
    phase === 'ready' ||
    createAsset.isPending ||
    requestFile.isPending ||
    completeFile.isPending;
  const fileSelectionDisabled = busy || (phase === 'failed' && retryStep === 'complete');

  useEffect(
    () => () => {
      putTask.current?.abort();
      if (readyTimeout.current !== null) window.clearTimeout(readyTimeout.current);
      validationRun.current += 1;
    },
    [],
  );

  const showUploadSuccess = () => {
    setPhase('ready');
    toast.success('Asset uploaded and ready');
    readyTimeout.current = window.setTimeout(() => {
      void navigate(PATHS.admin.assets);
    }, 850);
  };

  const chooseFile = async (selected: File | undefined) => {
    if (!selected || fileSelectionDisabled) return;
    const currentRun = ++validationRun.current;
    const retryingExistingAsset =
      phase === 'failed' && retryStep === 'replace' && uploadRequest !== null;
    if (phase === 'failed' && !retryingExistingAsset) {
      setUploadRequest(null);
      setPhase('idle');
      setProgress(0);
    }
    setFile(selected);
    setValidatedFile(null);
    setFileError(null);
    setError(null);
    setIsValidating(true);

    try {
      const validated = await validateAssetUploadFile(selected);
      if (validationRun.current !== currentRun) return;
      if (retryingExistingAsset && validated.type !== uploadRequest.asset.type) {
        setFileError(
          'A retry must use the same file type as the asset. Choose another file or cancel.',
        );
        return;
      }
      setValidatedFile(validated);
      setTitle((current) =>
        current.trim() ? current : selected.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      );
    } catch (validationError) {
      if (validationRun.current !== currentRun) return;
      setFileError(
        validationError instanceof AssetUploadValidationError
          ? validationError.message
          : 'The selected file could not be validated. Choose it again.',
      );
    } finally {
      if (validationRun.current === currentRun) setIsValidating(false);
    }
  };

  const finishUpload = async (request: AssetUploadRequest) => {
    if (!file) return;
    const expiry = Date.parse(request.upload.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      setRetryStep('replace');
      setPhase('failed');
      setError('The upload link is invalid or expired. Retry to request a fresh link.');
      return;
    }

    setProgress(0);
    setPhase('uploading');
    setError(null);
    const task = putAssetFile(request.upload, file, setProgress);
    putTask.current = task;

    try {
      await task.promise;
    } catch (putError) {
      setRetryStep('replace');
      setPhase('failed');
      setError(getPutFailureMessage(putError));
      return;
    } finally {
      putTask.current = null;
    }

    setPhase('completing');
    setProgress(100);
    try {
      const result = await completeFile.mutateAsync({
        id: request.asset.id,
        fileId: request.file.id,
      });
      if (result.status === 'READY') {
        showUploadSuccess();
        return;
      }
      if (result.status === 'FAILED') {
        setRetryStep('replace');
        setPhase('failed');
        setError(getFileFailureMessage(result));
        return;
      }

      setRetryStep('complete');
      setPhase('failed');
      setError('The file was uploaded but is not ready yet. Retry finalization.');
    } catch (completionError) {
      setRetryStep('complete');
      setPhase('failed');
      setError(
        `The file was uploaded, but final verification did not finish. ${getErrorMessage(completionError)} Retry finalization.`,
      );
    }
  };

  const requestReplacement = async () => {
    if (!file || !validatedFile || !uploadRequest) return;
    setPhase('preparing');
    setError(null);
    try {
      const request = await requestFile.mutateAsync({
        id: uploadRequest.asset.id,
        body: {
          filename: file.name,
          mimeType: validatedFile.mimeType,
          sizeBytes: file.size,
        },
      });
      setUploadRequest(request);
      await finishUpload(request);
    } catch (requestError) {
      setRetryStep('replace');
      setPhase('failed');
      setError(`Could not prepare a new upload. ${getErrorMessage(requestError)}`);
    }
  };

  const startUpload = async () => {
    if (!file || !validatedFile || busy) return;
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setError('Enter a title for this asset.');
      return;
    }
    setError(null);
    setPhase('preparing');

    try {
      const request = await createAsset.mutateAsync({
        title: normalizedTitle,
        type: validatedFile.type,
        filename: file.name,
        mimeType: validatedFile.mimeType,
        sizeBytes: file.size,
      });
      setUploadRequest(request);
      await finishUpload(request);
    } catch (createError) {
      setRetryStep('create');
      setPhase('failed');
      setError(`Could not prepare the asset upload. ${getErrorMessage(createError)}`);
    }
  };

  const retryUpload = async () => {
    if (busy) return;
    if (retryStep === 'complete' && uploadRequest) {
      setPhase('completing');
      setError(null);
      try {
        const result = await completeFile.mutateAsync({
          id: uploadRequest.asset.id,
          fileId: uploadRequest.file.id,
        });
        if (result.status === 'READY') {
          showUploadSuccess();
        } else if (result.status === 'FAILED') {
          setRetryStep('replace');
          setPhase('failed');
          setError(getFileFailureMessage(result));
        } else {
          setPhase('failed');
          setError('The file is not ready yet. Retry finalization.');
        }
      } catch (completionError) {
        setPhase('failed');
        setError(
          `The file was uploaded, but final verification did not finish. ${getErrorMessage(completionError)} Retry finalization.`,
        );
      }
      return;
    }
    if (uploadRequest) {
      await requestReplacement();
      return;
    }
    await startUpload();
  };

  const cancelUpload = () => {
    putTask.current?.abort();
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!fileSelectionDisabled) void chooseFile(event.dataTransfer.files[0]);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    void startUpload();
  };

  const activeStep =
    phase === 'uploading'
      ? 1
      : phase === 'completing'
        ? 2
        : phase === 'ready'
          ? 3
          : phase === 'failed'
            ? retryStep === 'complete'
              ? 2
              : 1
            : 0;
  const isStepComplete = (step: number) => phase === 'ready' || step < activeStep;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section
        className="relative min-h-96 self-stretch overflow-hidden rounded-3xl bg-teal-500 p-6 text-gray-900"
        aria-labelledby="upload-progress-title"
      >
        <span
          aria-hidden="true"
          className="absolute -bottom-10 -right-8 size-36 rounded-full bg-coral-500"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-2 right-20 size-20 rounded-full bg-yellow-500"
        />
        <h2 id="upload-progress-title" className="relative text-sm font-semibold">
          From upload to ready
        </h2>
        <ol className="relative mt-5 space-y-5 pb-20">
          {UPLOAD_STEPS.map((step, index) => {
            const complete = isStepComplete(index);
            const current = index === activeStep && phase !== 'ready';
            const failed = phase === 'failed' && current;
            return (
              <li
                key={step.title}
                aria-current={current ? 'step' : undefined}
                className="flex items-start gap-3"
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    failed
                      ? 'bg-magenta-800 text-white'
                      : complete
                        ? 'bg-gray-900 text-white'
                        : current
                          ? 'bg-coral-500 text-white'
                          : 'bg-white text-gray-900'
                  }`}
                >
                  {complete ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : failed ? (
                    '!'
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="pt-0.5">
                  <span className="block text-[13px] font-semibold">
                    {failed ? `${step.title} failed` : step.title}
                  </span>
                  <span className="block text-[11px]">
                    {index === 0 && file ? file.name : step.description}
                    {index === 1 && phase === 'uploading' ? ` · ${String(progress)}%` : ''}
                    {index === 2 && phase === 'completing' ? ' · Verifying upload' : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

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
            disabled={busy || Boolean(uploadRequest)}
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
            onDragOver={(event) => {
              event.preventDefault();
              if (!fileSelectionDisabled) setIsDragging(true);
            }}
            onDragLeave={() => {
              setIsDragging(false);
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
                  {formatFileSize(file.size)}
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
                  validationRun.current += 1;
                  setFile(null);
                  setValidatedFile(null);
                  setFileError(null);
                  setIsValidating(false);
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

        {phase === 'failed' && (error ?? uploadRequest) && (
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
