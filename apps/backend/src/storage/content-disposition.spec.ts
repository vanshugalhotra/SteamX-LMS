import { describe, expect, it } from 'vitest';
import { buildContentDisposition } from './content-disposition.js';

describe('buildContentDisposition', () => {
  it('uses inline when there is no filename', () => {
    expect(buildContentDisposition()).toBe('inline');
  });

  it.each([
    ['quoted"name.pdf', 'quoted_name.pdf'],
    ['semi;colon.pdf', 'semi_colon.pdf'],
    ['folder\\file/name.pdf', 'folderfilename.pdf'],
    ['line\r\nbreak.pdf', 'linebreak.pdf'],
    ['nul\u0000byte.pdf', 'nulbyte.pdf'],
  ])('sanitizes %s', (filename, fallback) => {
    const disposition = buildContentDisposition(filename);
    expect(disposition).toContain(`filename="${fallback}"`);
    expect(disposition).not.toMatch(/[\r\n\0]/);
    expect(disposition.match(/filename="([^"]*)"/)?.[1]).not.toContain('"');
  });

  it('limits the ASCII fallback to 150 characters', () => {
    const disposition = buildContentDisposition(`${'a'.repeat(160)}.pdf`);
    const fallback = disposition.match(/filename="([^"]*)"/)?.[1];
    expect(fallback).toHaveLength(150);
  });

  it.each(['नमस्ते.pdf', 'தமிழ்.pdf', '📘😀.pdf'])(
    'preserves Unicode names in filename* (%s)',
    (filename) => {
      const disposition = buildContentDisposition(filename);
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).toMatch(/filename\*=\S+/);
      expect(disposition).not.toMatch(/[\r\n\0]/);
    },
  );

  it.each(['', '   '])('uses file for an empty fallback from %j', (filename) => {
    expect(buildContentDisposition(filename)).toContain('filename="file"');
  });

  it('percent-encodes RFC 5987 special characters', () => {
    expect(buildContentDisposition("!'()*")).toContain("filename*=UTF-8''%21%27%28%29%2A");
  });
});
