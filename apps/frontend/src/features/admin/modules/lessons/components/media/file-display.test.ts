import { expect, it } from 'vitest';
import { describeFile } from './file-display';

it('describes a file with its name and size', () => {
  expect(describeFile({ originalFilename: 'a.pdf', sizeBytes: 1536 })).toBe('a.pdf · 2 KB');
  expect(describeFile({ originalFilename: 'a.pdf', sizeBytes: null })).toBe(
    'a.pdf · Size unavailable',
  );
  expect(describeFile(null)).toBe('');
});
