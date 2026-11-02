import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { AssetPutError, putAssetFile } from '../api/put-asset-file';
import {
  AssetUploadValidationError,
  validateAssetUploadFile,
  type ValidatedAssetFile,
} from '../config/upload-validation';
import type { AssetFile, AssetType, AssetUploadRequest } from '../model/types';
import { useCompleteAssetFileUpload, useCreateAsset, useRequestAssetFileUpload } from '../queries';

interface UseAssetUploadOptions {
  /** Replace the file of this asset instead of creating a new asset. */
  existingAsset?: { id: string; type: AssetType };
}

export type AssetUploadPhase =
  'idle' | 'preparing' | 'uploading' | 'completing' | 'ready' | 'failed';
export type AssetUploadRetryStep = 'create' | 'replace' | 'complete';

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

export function useAssetUpload({ existingAsset }: UseAssetUploadOptions = {}) {
  const navigate = useNavigate();
  const createAsset = useCreateAsset();
  const requestFile = useRequestAssetFileUpload();
  const completeFile = useCompleteAssetFileUpload();
  const putTask = useRef<{ abort: () => void } | null>(null);
  const readyTimeout = useRef<number | null>(null);
  const validationRun = useRef(0);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [validatedFile, setValidatedFile] = useState<ValidatedAssetFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [phase, setPhase] = useState<AssetUploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryStep, setRetryStep] = useState<AssetUploadRetryStep>('create');
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
  const titleDisabled = busy || Boolean(uploadRequest);
  const canRetry = phase === 'failed' && Boolean(error ?? uploadRequest);

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
    toast.success(existingAsset ? 'File replaced' : 'Asset uploaded and ready');
    // A replacement stays on the details page; the caller shows the result.
    if (existingAsset) return;
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

    const expectedType = retryingExistingAsset ? uploadRequest.asset.type : existingAsset?.type;

    try {
      const validated = await validateAssetUploadFile(selected);
      if (validationRun.current !== currentRun) return;
      if (expectedType !== undefined && validated.type !== expectedType) {
        setFileError('The file must be the same type as the asset. Choose another file or cancel.');
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
    const assetId = uploadRequest?.asset.id ?? existingAsset?.id;
    if (!file || !validatedFile || assetId === undefined) return;
    setPhase('preparing');
    setError(null);
    try {
      const request = await requestFile.mutateAsync({
        id: assetId,
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
    if (existingAsset) {
      await requestReplacement();
      return;
    }
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

  const reset = () => {
    putTask.current?.abort();
    validationRun.current += 1;
    setFile(null);
    setValidatedFile(null);
    setFileError(null);
    setIsValidating(false);
    setPhase('idle');
    setProgress(0);
    setError(null);
    setRetryStep('create');
    setUploadRequest(null);
  };

  const removeSelectedFile = () => {
    validationRun.current += 1;
    setFile(null);
    setValidatedFile(null);
    setFileError(null);
    setIsValidating(false);
  };

  return {
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
    reset,
  };
}
