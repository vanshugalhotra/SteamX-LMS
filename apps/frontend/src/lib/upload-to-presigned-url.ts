import { ApiError } from './api-client';

export type UploadProgressHandler = (loaded: number, total: number) => void;

export function uploadToPresignedUrl(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: UploadProgressHandler,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abortError = () =>
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException('The upload was aborted.', 'AbortError');
    const abort = () => {
      request.abort();
      fail(abortError());
    };

    if (signal.aborted) {
      fail(abortError());
      return;
    }

    request.open('PUT', url);
    request.withCredentials = false;
    Object.entries(headers).forEach(([name, value]) => {
      request.setRequestHeader(name, value);
    });
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    request.addEventListener('load', () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new ApiError(request.status, 'Upload failed.'));
      }
    });
    request.addEventListener('error', () => {
      fail(new ApiError(0, 'Network error.'));
    });
    request.addEventListener('abort', () => {
      fail(abortError());
    });
    signal.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
}
