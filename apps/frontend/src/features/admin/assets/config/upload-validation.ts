import type { SupportedAssetType } from '../model/types';

const MIB = 1024 * 1024;
const MIN_UPLOAD_BYTES = 16;

export const ASSET_UPLOAD_LIMITS = {
  image: 10 * MIB,
  pdf: 50 * MIB,
  video: 1024 * MIB,
} as const;

const FILE_TYPES = {
  jpg: {
    type: 'IMAGE',
    mimeType: 'image/jpeg',
    maxBytes: ASSET_UPLOAD_LIMITS.image,
    signature: 'JPEG',
  },
  jpeg: {
    type: 'IMAGE',
    mimeType: 'image/jpeg',
    maxBytes: ASSET_UPLOAD_LIMITS.image,
    signature: 'JPEG',
  },
  png: {
    type: 'IMAGE',
    mimeType: 'image/png',
    maxBytes: ASSET_UPLOAD_LIMITS.image,
    signature: 'PNG',
  },
  webp: {
    type: 'IMAGE',
    mimeType: 'image/webp',
    maxBytes: ASSET_UPLOAD_LIMITS.image,
    signature: 'WEBP',
  },
  pdf: {
    type: 'PDF',
    mimeType: 'application/pdf',
    maxBytes: ASSET_UPLOAD_LIMITS.pdf,
    signature: 'PDF',
  },
  mp4: {
    type: 'VIDEO',
    mimeType: 'video/mp4',
    maxBytes: ASSET_UPLOAD_LIMITS.video,
    signature: 'MP4',
  },
} as const satisfies Record<
  string,
  {
    type: SupportedAssetType;
    mimeType: string;
    maxBytes: number;
    signature: 'JPEG' | 'PNG' | 'WEBP' | 'PDF' | 'MP4';
  }
>;

type AssetFileExtension = keyof typeof FILE_TYPES;

export interface ValidatedAssetFile {
  type: SupportedAssetType;
  mimeType: string;
}

export class AssetUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetUploadValidationError';
  }
}

function isAssetFileExtension(extension: string): extension is AssetFileExtension {
  return Object.hasOwn(FILE_TYPES, extension);
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function detectFileSignature(bytes: Uint8Array): 'JPEG' | 'PNG' | 'WEBP' | 'PDF' | 'MP4' | null {
  if (bytes.length < MIN_UPLOAD_BYTES) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  if (
    bytes[0] === 0x89 &&
    matchesAscii(bytes, 1, 'PNG') &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'PNG';
  }
  if (matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')) return 'WEBP';
  if (matchesAscii(bytes, 0, '%PDF-')) return 'PDF';

  const mp4Brand = String.fromCharCode(...bytes.slice(8, 12));
  const mp4Brands = [
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
  ];
  if (matchesAscii(bytes, 4, 'ftyp') && mp4Brands.includes(mp4Brand)) return 'MP4';

  return null;
}

export async function validateAssetUploadFile(file: File): Promise<ValidatedAssetFile> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!isAssetFileExtension(extension)) {
    throw new AssetUploadValidationError('Choose a JPG, PNG, WebP, PDF, or MP4 file.');
  }
  if (file.name.length > 255) {
    throw new AssetUploadValidationError('The filename must be 255 characters or fewer.');
  }

  const details = FILE_TYPES[extension];
  if (file.type && file.type.toLowerCase() !== details.mimeType) {
    throw new AssetUploadValidationError(
      `The selected file type does not match its .${extension} extension.`,
    );
  }
  if (file.size < MIN_UPLOAD_BYTES) {
    throw new AssetUploadValidationError('The file must be at least 16 bytes.');
  }
  if (file.size > details.maxBytes) {
    throw new AssetUploadValidationError(
      `This file exceeds the ${formatUploadLimit(details.maxBytes)} limit.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, MIN_UPLOAD_BYTES).arrayBuffer());
  } catch {
    throw new AssetUploadValidationError('The file could not be read. Choose it again and retry.');
  }

  if (detectFileSignature(bytes) !== details.signature) {
    throw new AssetUploadValidationError(
      `The file contents are not a valid ${details.mimeType} file.`,
    );
  }

  return { type: details.type, mimeType: details.mimeType };
}

export function formatUploadLimit(bytes: number): string {
  const GIB = 1024 * MIB;
  if (bytes >= GIB && bytes % GIB === 0) return `${String(bytes / GIB)} GiB`;
  return `${String(bytes / MIB)} MiB`;
}
