import { env } from './env';

const API_PREFIX = '/api/v1';
const BASE_URL = `${env.VITE_API_URL}${API_PREFIX}`;

interface ApiErrorBody {
  code?: string;
  message?: string;
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
  onUnauthorized?: (error: ApiError) => void;
  onForbidden?: (error: ApiError) => void;
}

let handlers: Handlers = {};

export function setApiHandlers(next: Handlers) {
  handlers = next;
}

export interface ApiRequestOptions extends RequestInit {
  /**
   * Skip the global onUnauthorized / onForbidden handlers.
   * Use for calls where 401 is an expected answer (session probe, login attempt).
   */
  skipAuthHandlers?: boolean;
}

export async function apiFetch<T>(
  path: string,
  { skipAuthHandlers = false, ...options }: ApiRequestOptions = {},
): Promise<T> {
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

  let data: unknown = null;
  let parseFailed = false;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      parseFailed = true;
    }
  }

  if (!res.ok) {
    const body = typeof data === 'object' && data !== null ? (data as ApiErrorBody) : undefined;
    // `message` is for logs/debugging only; the UI uses getErrorMessage().
    const error = new ApiError(
      res.status,
      body?.message ?? `Request failed (${String(res.status)})`,
      body,
    );

    if (!skipAuthHandlers) {
      if (res.status === 401) handlers.onUnauthorized?.(error);
      if (res.status === 403) handlers.onForbidden?.(error);
    }
    throw error;
  }

  if (parseFailed) {
    throw new ApiError(res.status, 'Invalid response from server.');
  }

  return data as T;
}
