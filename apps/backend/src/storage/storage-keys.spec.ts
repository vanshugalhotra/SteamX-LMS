import { describe, expect, it } from 'vitest';
import { assertValidKey, assertValidPrefix, StorageInvalidArgumentError } from './storage-keys.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_UUID = '123e4567-e89b-12d3-a456-426614174001';

describe('assertValidKey', () => {
  it.each([`assets/${UUID}/${OTHER_UUID}/original`, `submissions/${UUID}/x.pdf`])(
    'accepts %s',
    (key) => {
      expect(() => assertValidKey(key)).not.toThrow();
    },
  );

  it.each([
    `/assets/${UUID}/file`,
    `assets/${UUID}/../file`,
    `assets/${UUID}//file`,
    `unknown/${UUID}/file`,
    'assets/not-a-uuid/file',
    `assets/${UUID.toUpperCase()}/file`,
    'assets/123e4567-e89b-12d3-7456-426614174000/file',
    `assets/${UUID}/has space`,
    `assets/${UUID}/has\\backslash`,
    `assets/${UUID}/caf\u00e9`,
    `assets/${UUID}/${'x'.repeat(1_100)}`,
  ])('rejects %s', (key) => {
    expect(() => assertValidKey(key)).toThrow(StorageInvalidArgumentError);
  });
});

describe('assertValidPrefix', () => {
  it.each([`assets/${UUID}/`, `assets/${UUID}/${OTHER_UUID}/`, `submissions/${UUID}/`])(
    'accepts %s',
    (prefix) => {
      expect(() => assertValidPrefix(prefix)).not.toThrow();
    },
  );

  it.each([
    'assets/',
    'submissions/',
    'assets/foo/',
    `assets/${UUID}`,
    '',
    'assets//',
    `assets/${UUID}/../`,
  ])('rejects %s', (prefix) => {
    expect(() => assertValidPrefix(prefix)).toThrow(StorageInvalidArgumentError);
  });
});
