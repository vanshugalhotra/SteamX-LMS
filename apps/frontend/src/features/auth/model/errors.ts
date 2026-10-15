import { ApiError } from '@/lib/api-client';

export const PASSWORD_POLICY = 'PASSWORD_POLICY';
export const INVALID_CURRENT_PASSWORD = 'INVALID_CURRENT_PASSWORD';
export const PASSWORD_REUSED = 'PASSWORD_REUSED';

const POLICY_FALLBACK = 'Password does not meet the policy.';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export const isPasswordChangeRequired = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === PASSWORD_CHANGE_REQUIRED;

/** `details` from PASSWORD_POLICY errors, if it is a list of strings. */
export function detailStrings(details: unknown): string[] | undefined {
  if (!Array.isArray(details)) return undefined;
  const items: unknown[] = details;
  return items.every((d): d is string => typeof d === 'string') ? items : undefined;
}

// Keys mirror the backend's PASSWORD_POLICY_VIOLATION codes
const POLICY_MESSAGES: Record<string, string> = {
  PASSWORD_LENGTH: 'Password must be between 8 and 100 characters.',
  PASSWORD_WHITESPACE: 'Password must not start or end with spaces.',
  PASSWORD_COMMON: 'Password is too common.',
  PASSWORD_CONTAINS_STEAMX_ID: 'Password must not contain your SteamX ID.',
};

/** Readable messages for the violation codes in PASSWORD_POLICY `details`. */
export function policyMessages(details: unknown): string[] {
  const codes = detailStrings(details);
  if (!codes?.length) return [POLICY_FALLBACK];
  return [...new Set(codes.map((code) => POLICY_MESSAGES[code] ?? POLICY_FALLBACK))];
}
