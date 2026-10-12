import { ApiError } from '@/lib/api-client';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export const isPasswordChangeRequired = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === PASSWORD_CHANGE_REQUIRED;

/** `details` from PASSWORD_POLICY errors, if it is a list of strings. */
export function detailStrings(details: unknown): string[] | undefined {
  if (!Array.isArray(details)) return undefined;
  const items: unknown[] = details;
  return items.every((d): d is string => typeof d === 'string') ? items : undefined;
}