const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

// Backend error shape: { statusCode, code, message, details?, requestId }
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code?: string, message?: string, details?: unknown, requestId?: string) {
    super(message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

interface ErrorBody {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  requestId?: unknown;
}

const asString = (v: unknown) => (typeof v === 'string' ? v : undefined);

type Options = Omit<RequestInit, 'body' | 'headers'> & { json?: unknown };

export async function api<T = unknown>(path: string, { json, ...rest }: Options = {}): Promise<T> {
  const headers = new Headers();
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const body = (data ?? {}) as ErrorBody;
    throw new ApiError(res.status, asString(body.code), asString(body.message), body.details, asString(body.requestId));
  }
  return data as T;
}

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export const isPasswordChangeRequired = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === PASSWORD_CHANGE_REQUIRED;

/** `details` from PASSWORD_POLICY errors, if it is a list of strings. */
export function detailStrings(details: unknown): string[] | undefined {
  if (!Array.isArray(details)) return undefined;
  const items: unknown[] = details;
  return items.every((d): d is string => typeof d === 'string') ? items : undefined;
}
