import { getErrorMessage } from './api-errors';

export type UploadProgressHandler = (loaded: number, total: number) => void;

export type UploadErrorReason = 'expired' | 'rejected' | 'network' | 'aborted' | 'server';

export class UploadError extends Error {
  readonly reason: UploadErrorReason;
  readonly status: number | undefined;

  constructor(reason: UploadErrorReason, status?: number) {
    super(`Upload failed (${reason})`);
    this.name = 'UploadError';
    this.reason = reason;
    this.status = status;
  }
}

const UPLOAD_ERROR_MESSAGES: Record<UploadErrorReason, string> = {
  expired: 'The upload link expired. Please try again.',
  rejected: 'The file was rejected. Check the file type and size, then try again.',
  network: 'Network error. Please check your connection.',
  aborted: 'The upload was cancelled.',
  server: 'The storage service had a problem. Please try again.',
};

/** User-facing message for any upload failure. Never returns error.message. */
export function getUploadErrorMessage(error: unknown): string {
  return error instanceof UploadError
    ? UPLOAD_ERROR_MESSAGES[error.reason]
    : getErrorMessage(error);
}

function reasonForStatus(status: number): UploadErrorReason {
  if (status === 403) return 'expired';
  if (status >= 400 && status < 500) return 'rejected';
  return 'server';
}

export function uploadToPresignedUrl(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: UploadProgressHandler,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new UploadError('aborted'));
      return;
    }

    const request = new XMLHttpRequest();
    const onSignalAbort = () => {
      request.abort();
    };
    const cleanup = () => {
      signal.removeEventListener('abort', onSignalAbort);
    };
    const fail = (error: UploadError) => {
      cleanup();
      reject(error);
    };

    request.open('PUT', url);
    request.withCredentials = false;
    Object.entries(headers).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        cleanup();
        resolve();
      } else {
        fail(new UploadError(reasonForStatus(request.status), request.status));
      }
    });
    request.addEventListener('error', () => {
      fail(new UploadError('network'));
    });
    request.addEventListener('abort', () => {
      fail(new UploadError('aborted'));
    });
    signal.addEventListener('abort', onSignalAbort, { once: true });
    request.send(file);
  });
}
