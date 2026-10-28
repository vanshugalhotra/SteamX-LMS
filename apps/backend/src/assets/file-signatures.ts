/** Detects the supported upload formats from a bounded sample of file bytes. */
export type FileKind = 'JPEG' | 'PNG' | 'WEBP' | 'PDF' | 'MP4';

// MP4 brands approved for uploads. HEIC and QuickTime/MOV brands must not pass as MP4.
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'dash',
]);

/** Compares a fixed ASCII marker without decoding or interpreting the rest of the file. */
function matchesAscii(bytes: Buffer, offset: number, value: string): boolean {
  return bytes.toString('ascii', offset, offset + value.length) === value;
}

/** Identifies supported formats from their leading bytes; incomplete samples are not trusted. */
export function detectFileKind(bytes: Buffer): FileKind | null {
  if (bytes.length < 16) {
    return null;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'JPEG';
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'PNG';
  }
  if (matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')) {
    return 'WEBP';
  }
  if (matchesAscii(bytes, 0, '%PDF-')) {
    return 'PDF';
  }
  if (matchesAscii(bytes, 4, 'ftyp') && MP4_BRANDS.has(bytes.toString('ascii', 8, 12))) {
    return 'MP4';
  }
  return null;
}
