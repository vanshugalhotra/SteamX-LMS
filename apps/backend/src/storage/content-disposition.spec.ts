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

  it('limits the Unicode filename as well as the ASCII fallback', () => {
    const disposition = buildContentDisposition(`${'😀'.repeat(200)}.pdf`);
    const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]*)/)?.[1];
    expect(encodedFilename).toBe(encodeURIComponent('😀'.repeat(150)));
  });

  it('uses file for both filename forms when sanitizing removes the whole name', () => {
    expect(buildContentDisposition('\u0000\u001f\u007f')).toBe(
      `inline; filename="file"; filename*=UTF-8''file`,
    );
  });

  it('replaces percent in the ASCII fallback to prevent browser percent-decoding', () => {
    expect(buildContentDisposition('a%41.pdf')).toContain('filename="a_41.pdf"');
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
