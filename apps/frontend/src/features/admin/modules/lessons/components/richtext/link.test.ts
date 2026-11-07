import { expect, it } from 'vitest';
import { normalizeLinkUrl } from './link';

it('adds https and keeps allowed protocols', () => {
  expect(normalizeLinkUrl('example.com')).toBe('https://example.com/');
  expect(normalizeLinkUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
});

it('rejects empty and unsafe links', () => {
  expect(normalizeLinkUrl('  ')).toBeNull();
  expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
});
