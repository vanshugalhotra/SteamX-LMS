import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetPutError, putAssetFile } from './put-asset-file';
import type { UploadInstructions } from '../model/types';

class MockXMLHttpRequest extends EventTarget {
  readonly upload = new EventTarget();
  status = 0;
  method: string | null = null;
  url: string | null = null;
  sentFile: File | null = null;
  readonly headers = new Map<string, string>();
  static instance: MockXMLHttpRequest | null = null;

  constructor() {
    super();
    MockXMLHttpRequest.instance = this;
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  send(body: XMLHttpRequestBodyInit | Document | null): void {
    this.sentFile = body instanceof File ? body : null;
  }

  abort(): void {
    this.dispatchEvent(new Event('abort'));
  }
}

const instructions: UploadInstructions = {
  method: 'PUT',
  url: 'https://storage.example/upload',
  headers: {
    'Content-Type': 'image/jpeg',
    'If-None-Match': '*',
  },
  expiresAt: '2026-01-01T00:00:00.000Z',
};

function getRequest(): MockXMLHttpRequest {
  const instance = MockXMLHttpRequest.instance;
  if (!instance) throw new Error('Expected the upload request to be created.');
  return instance;
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockXMLHttpRequest.instance = null;
});

describe('putAssetFile', () => {
  it('sends the signed PUT request and reports upload progress', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const file = new File(['asset'], 'asset.jpg', { type: 'image/jpeg' });
    const progress: number[] = [];

    const task = putAssetFile(instructions, file, (percent) => {
      progress.push(percent);
    });
    const request = getRequest();

    expect(request.method).toBe('PUT');
    expect(request.url).toBe(instructions.url);
    expect(request.headers.get('Content-Type')).toBe('image/jpeg');
    expect(request.headers.get('If-None-Match')).toBe('*');
    expect(request.sentFile).toBe(file);

    request.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded: 25, total: 100 }),
    );
    request.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded: 1, total: 0 }),
    );
    request.status = 200;
    request.dispatchEvent(new Event('load'));

    await expect(task.promise).resolves.toBeUndefined();
    expect(progress).toEqual([25, 100]);
  });

  it('surfaces storage HTTP failures and supports cancellation', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const file = new File(['asset'], 'asset.jpg', { type: 'image/jpeg' });
    const failedTask = putAssetFile(instructions, file, vi.fn());
    getRequest().status = 403;
    getRequest().dispatchEvent(new Event('load'));
    await expect(failedTask.promise).rejects.toMatchObject<Partial<AssetPutError>>({
      status: 403,
    });

    const canceledTask = putAssetFile(instructions, file, vi.fn());
    canceledTask.abort();
    await expect(canceledTask.promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
