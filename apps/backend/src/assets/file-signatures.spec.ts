import { detectFileKind } from './file-signatures.js';

describe('detectFileKind', () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, ...Array(13).fill(0)]), 'JPEG'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(8).fill(0)]), 'PNG'],
    [Buffer.from('RIFF0000WEBP0000', 'ascii'), 'WEBP'],
    [Buffer.from('%PDF-1.7xxxxxxxx', 'ascii'), 'PDF'],
    [Buffer.from('0000ftypisom0000', 'ascii'), 'MP4'],
  ] as const)('detects %s', (bytes, expected) => {
    expect(detectFileKind(bytes)).toBe(expected);
  });

  it.each([
    Buffer.from('RIFF0000WAVE0000', 'ascii'),
    Buffer.from('0000ftypheic0000', 'ascii'),
    Buffer.from('0000ftypqt  0000', 'ascii'),
    Buffer.from('0000%PDF-1.7xxxx', 'ascii'),
    Buffer.alloc(15),
    Buffer.alloc(0),
  ])('rejects near-miss or short signature %s', (bytes) => {
    expect(detectFileKind(bytes)).toBeNull();
  });
});
