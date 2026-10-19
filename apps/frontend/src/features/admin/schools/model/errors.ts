import { ApiError } from '@/lib/api-client';

export const SCHOOL_CODE_EXISTS = 'SCHOOL_CODE_EXISTS';
const VALIDATION_ERROR = 'VALIDATION_ERROR';

/** `{ field, errors[] }` entries of a VALIDATION_ERROR, as field -> first message. */
export function validationFieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!(error instanceof ApiError) || error.code !== VALIDATION_ERROR) return result;
  if (!Array.isArray(error.details)) return result;

  const entries: unknown[] = error.details;
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { field, errors } = entry as { field?: unknown; errors?: unknown };
    if (typeof field !== 'string' || !Array.isArray(errors)) continue;
    const first: unknown = errors[0];
    if (typeof first === 'string') result[field] = first;
  }
  return result;
}

/** A readable message for errors that don't belong to a single field. */
export function schoolErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 403) return 'Only platform staff can manage schools.';
  return error.message;
}
