import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UploadError,
  getUploadErrorMessage,
  uploadToPresignedUrl,
} from './upload-to-presigned-url';

type Listener = (event: unknown) => void;

function add(map: Map<string, Listener[]>, type: string, fn: Listener) {
  map.set(type, [...(map.get(type) ?? []), fn]);
}

class FakeXhr {
  static instance: FakeXhr;
  status = 0;
  withCredentials = true;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  private listeners = new Map<string, Listener[]>();
  private uploadListeners = new Map<string, Listener[]>();
  upload = {
    addEventListener: (type: string, fn: Listener) => {
      add(this.uploadListeners, type, fn);
    },
  };

  constructor() {
    FakeXhr.instance = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  addEventListener(type: string, fn: Listener) {
    add(this.listeners, type, fn);
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.emit('abort');
  }
  emit(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((fn) => {
      fn(event);
    });
  }
  progress(loaded: number, total: number, lengthComputable = true) {
    this.uploadListeners.get('progress')?.forEach((fn) => {
      fn({ loaded, total, lengthComputable });
    });
  }
  respond(status: number) {
    this.status = status;
    this.emit('load');
  }
}

const file = new File(['data'], 'cover.png', { type: 'image/png' });

function start(signal: AbortSignal = new AbortController().signal, onProgress = vi.fn()) {
  const promise = uploadToPresignedUrl(
    'https://storage.test/upload',
    file,
    { 'Content-Type': 'image/png' },
    onProgress,
    signal,
  );
  return { promise, xhr: FakeXhr.instance, onProgress };
}

describe('uploadToPresignedUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs the file with the given headers and no credentials', async () => {
    const { promise, xhr } = start();
    xhr.respond(200);
    await expect(promise).resolves.toBeUndefined();
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://storage.test/upload');
    expect(xhr.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.body).toBe(file);
  });

  it('reports progress only when the length is computable', () => {
    const { xhr, onProgress } = start();
    xhr.progress(10, 100);
    xhr.progress(50, 0, false);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(10, 100);
  });

  it.each([
    [403, 'expired'],
    [400, 'rejected'],
    [412, 'rejected'],
    [413, 'rejected'],
    [500, 'server'],
    [503, 'server'],
  ])('maps status %i to reason %s', async (status, reason) => {
    const { promise, xhr } = start();
    xhr.respond(status);
    await expect(promise).rejects.toBeInstanceOf(UploadError);
    await expect(promise).rejects.toHaveProperty('reason', reason);
    await expect(promise).rejects.toHaveProperty('status', status);
  });

  it('rejects with reason network on a network error', async () => {
    const { promise, xhr } = start();
    xhr.emit('error');
    await expect(promise).rejects.toHaveProperty('reason', 'network');
  });

  it('aborts the request and rejects with reason aborted when the signal aborts', async () => {
    const controller = new AbortController();
    const { promise } = start(controller.signal);
    const abortSpy = vi.spyOn(FakeXhr.instance, 'abort');
    controller.abort();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toHaveProperty('reason', 'aborted');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { promise } = start(controller.signal);
    await expect(promise).rejects.toHaveProperty('reason', 'aborted');
  });

  it('removes the abort listener once the upload settles', async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');
    const { promise, xhr } = start(controller.signal);
    xhr.respond(200);
    await promise;
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('getUploadErrorMessage', () => {
  it('returns a friendly message per reason, never the raw error message', () => {
    const message = getUploadErrorMessage(new UploadError('expired', 403));
    expect(message).toBe('The upload link expired. Please try again.');
  });

  it('falls back to the generic message for unknown errors', () => {
    expect(getUploadErrorMessage(new Error('boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
