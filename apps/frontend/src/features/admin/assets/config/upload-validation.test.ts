import { describe, expect, it } from 'vitest';
import { validateAssetUploadFile } from './upload-validation';

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function zeros(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function makeFile(name: string, mimeType: string, content: ArrayBuffer): File {
  return new File([content], name, { type: mimeType });
}

function makeFileWithSize(
  name: string,
  mimeType: string,
  content: ArrayBuffer,
  size: number,
): File {
  const file = makeFile(name, mimeType, content);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateAssetUploadFile', () => {
  it.each([
    ['image.jpg', 'image/jpeg', 'IMAGE'],
    ['image.jpeg', 'image/jpeg', 'IMAGE'],
    ['image.png', 'image/png', 'IMAGE'],
    ['image.webp', 'image/webp', 'IMAGE'],
    ['document.pdf', 'application/pdf', 'PDF'],
    ['video.mp4', 'video/mp4', 'VIDEO'],
  ] as const)('accepts a signed %s file', async (name, mimeType, type) => {
    const expectedContent = {
      jpg: bytes(0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      jpeg: bytes(0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      png: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0),
      webp: bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0),
      pdf: bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0),
      mp4: bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0),
    }[name.split('.').pop() as 'jpg' | 'jpeg' | 'png' | 'webp' | 'pdf' | 'mp4'];

    await expect(
      validateAssetUploadFile(makeFile(name, mimeType, expectedContent)),
    ).resolves.toEqual({ type, mimeType });
  });

  it('rejects unsupported extensions and mismatched MIME types', async () => {
    await expect(
      validateAssetUploadFile(
        makeFile('slides.pptx', 'application/vnd.ms-powerpoint', bytes(...zeros(16))),
      ),
    ).rejects.toThrow('Choose a JPG, PNG, WebP, PDF, or MP4 file.');
    await expect(
      validateAssetUploadFile(makeFile('image.png', 'application/pdf', bytes(...zeros(16)))),
    ).rejects.toThrow('does not match');
  });

  it('rejects files that are too small or do not match their content signature', async () => {
    await expect(
      validateAssetUploadFile(makeFile('short.pdf', 'application/pdf', bytes(0x25, 0x50, 0x44))),
    ).rejects.toThrow('at least 16 bytes');
    await expect(
      validateAssetUploadFile(makeFile('fake.pdf', 'application/pdf', bytes(...zeros(16)))),
    ).rejects.toThrow('not a valid application/pdf');
  });

  it.each([
    [
      'image.jpg',
      'image/jpeg',
      'IMAGE',
      bytes(0xff, 0xd8, 0xff, ...zeros(13)),
      10 * 1024 * 1024,
      '10 MiB',
    ],
    [
      'document.pdf',
      'application/pdf',
      'PDF',
      bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, ...zeros(8)),
      50 * 1024 * 1024,
      '50 MiB',
    ],
    [
      'video.mp4',
      'video/mp4',
      'VIDEO',
      bytes(0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0),
      1024 * 1024 * 1024,
      '1 GiB',
    ],
  ] as const)(
    'accepts %s at its size limit and rejects it above the limit',
    async (name, mimeType, type, content, maxBytes, limitLabel) => {
      await expect(
        validateAssetUploadFile(makeFileWithSize(name, mimeType, content, maxBytes)),
      ).resolves.toEqual({ type, mimeType });
      await expect(
        validateAssetUploadFile(makeFileWithSize(name, mimeType, content, maxBytes + 1)),
      ).rejects.toThrow(`${limitLabel} limit`);
    },
  );
});
