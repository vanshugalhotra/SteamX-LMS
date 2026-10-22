import { z } from 'zod';

/**
 * Validates the object-key grammar shared by S3 and the in-memory test double.
 *
 * Object keys identify resources with UUIDs and fixed path segments; user filenames
 * stay in the database and must never be used to construct a key.
 */
const CANONICAL_UUID = z.uuid().refine((value) => value === value.toLowerCase());
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Rejects invalid storage keys and prefixes before they reach an S3 request. */
export class StorageInvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = StorageInvalidArgumentError.name;
  }
}

function isValidSegment(segment: string): boolean {
  return segment !== '.' && segment !== '..' && SEGMENT_PATTERN.test(segment);
}

/** Accepts RFC-valid UUIDs only in lowercase canonical form. */
function isCanonicalUuid(value: string | undefined): boolean {
  return value !== undefined && CANONICAL_UUID.safeParse(value).success;
}

/**
 * Valid keys look like `assets/<uuid>/<segment>[/<segment>...]` or
 * `submissions/<uuid>/<segment>[/<segment>...]`.
 */
export function assertValidKey(key: string): void {
  // S3 limits object keys to 1,024 UTF-8 bytes, not JavaScript characters.
  if (Buffer.byteLength(key, 'utf8') > 1024) {
    throw new StorageInvalidArgumentError('Storage key must not exceed 1024 bytes');
  }

  const segments = key.split('/');
  const [namespace, resourceId, ...resourcePath] = segments;

  if (
    !['assets', 'submissions'].includes(namespace ?? '') ||
    !isCanonicalUuid(resourceId) ||
    resourcePath.length === 0 ||
    resourcePath.some((segment) => !isValidSegment(segment))
  ) {
    throw new StorageInvalidArgumentError('Storage key is invalid');
  }
}

/**
 * Prefixes must end at a resource boundary, e.g. `assets/<uuid>/`.
 * School-wide `submissions/<schoolId>/` prefixes are also valid for purge workflows.
 */
export function assertValidPrefix(prefix: string): void {
  // Requiring the slash prevents matching neighboring IDs such as `<id>-extra`.
  if (!prefix.endsWith('/')) {
    throw new StorageInvalidArgumentError('Storage prefix must end with a slash');
  }

  const segments = prefix.slice(0, -1).split('/');
  const [namespace, resourceId, ...resourcePath] = segments;

  if (
    !['assets', 'submissions'].includes(namespace ?? '') ||
    !isCanonicalUuid(resourceId) ||
    resourcePath.some((segment) => !isValidSegment(segment))
  ) {
    throw new StorageInvalidArgumentError('Storage prefix is invalid');
  }
}
