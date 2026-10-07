import { env } from './env';

const BASE_URL = env.VITE_API_URL;

interface ApiErrorBody {
  code?: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
    this.requestId = body?.requestId;
  }
}

interface Handlers {
  onUnauthorized?: () => void;
  onForbidden?: () => void;
}

let handlers: Handlers = {};

export function setApiHandlers(next: Handlers) {
  handlers = next;
}

const FALLBACK_MESSAGES: Partial<Record<number, string>> = {
  401: 'Your session has expired. Please log in again.',
  403: "You don't have access to this.",
  404: "We couldn't find what you were looking for.",
};

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      credentials: 'include', // httpOnly cookies
      headers,
    });
  } catch {
    throw new ApiError(0, 'Network error. Please check your connection.');
  }

  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) handlers.onUnauthorized?.();
    if (res.status === 403) handlers.onForbidden?.();

    const message = FALLBACK_MESSAGES[res.status] ?? 'Something went wrong. Please try again.';
    const body = typeof data === 'object' && data !== null ? (data as ApiErrorBody) : undefined;
    throw new ApiError(res.status, message, body);
  }

  return data as T;
}
