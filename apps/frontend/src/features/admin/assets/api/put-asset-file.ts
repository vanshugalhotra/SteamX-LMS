import type { UploadInstructions } from '../model/types';

export class AssetPutError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AssetPutError';
    this.status = status;
  }
}

export interface AssetPutTask {
  promise: Promise<void>;
  abort: () => void;
}

export function putAssetFile(
  upload: UploadInstructions,
  file: File,
  onProgress: (percent: number) => void,
): AssetPutTask {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new AssetPutError('The storage service rejected the upload.', xhr.status));
    });
    xhr.addEventListener('error', () => {
      reject(new AssetPutError('The upload was interrupted by a network or storage error.'));
    });
    xhr.addEventListener('abort', () => {
      reject(new DOMException('Upload canceled.', 'AbortError'));
    });
    xhr.send(file);
  });

  return {
    promise,
    abort: () => {
      xhr.abort();
    },
  };
}
