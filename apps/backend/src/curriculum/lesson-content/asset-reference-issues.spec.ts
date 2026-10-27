// Tests for asset rules applied when lesson content is saved.
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
} from '../../generated/prisma/enums.js';
import type { AssetSummary } from '../../assets/assets.types.js';
import type { NormalizedBlock } from './validation/types.js';
import { findAssetReferenceIssues } from './asset-reference-issues.js';

/** Build a block that references an asset. */
const block = (assetId: string, type = BlockType.IMAGE, id = 'image-1'): NormalizedBlock => ({
  id,
  type,
  assetId,
  content: {},
});

/** Build an asset summary with the chosen type, status, and file state. */
const asset = (
  id: string,
  options: {
    type?: AssetType;
    status?: ContentStatus;
    fileStatus?: AssetFileStatus | null;
  } = {},
): AssetSummary => ({
  id,
  type: options.type ?? AssetType.IMAGE,
  title: 'Asset',
  status: options.status ?? ContentStatus.ACTIVE,
  file:
    options.fileStatus === null
      ? null
      : {
          status: options.fileStatus ?? AssetFileStatus.READY,
          mimeType: null,
          sizeBytes: null,
          originalFilename: null,
          lastError: null,
        },
});

describe('findAssetReferenceIssues', () => {
  it.each([
    ['missing', 'missing', new Map(), new Set(), ['ASSET_NOT_FOUND']],
    [
      'wrong type',
      'wrong-type',
      new Map([['wrong-type', asset('wrong-type', { type: AssetType.PDF })]]),
      new Set(),
      ['ASSET_TYPE_MISMATCH'],
    ],
    [
      'new archived asset',
      'archived',
      new Map([['archived', asset('archived', { status: ContentStatus.ARCHIVED })]]),
      new Set(),
      ['ASSET_ARCHIVED'],
    ],
    [
      'new asset without READY file',
      'not-ready',
      new Map([['not-ready', asset('not-ready', { fileStatus: AssetFileStatus.FAILED })]]),
      new Set(),
      ['ASSET_NOT_READY'],
    ],
    [
      'existing archived asset',
      'existing-archived',
      new Map([
        ['existing-archived', asset('existing-archived', { status: ContentStatus.ARCHIVED })],
      ]),
      new Set(['existing-archived']),
      [],
    ],
  ])('reports %s', (_label, assetId, summaries, existingIds, expectedCodes) => {
    const issues = findAssetReferenceIssues(
      [block(assetId as string)],
      summaries as Map<string, AssetSummary>,
      existingIds as Set<string>,
    );
    expect(issues.map(({ code }) => code)).toEqual(expectedCodes);
    for (const issue of issues) expect(issue.path).toBe('blocks[0].assetId');
  });

  it('allows existing and new references together and reports every new violation by path', () => {
    const blocks = [
      block('archived', BlockType.IMAGE, 'first'),
      block('archived', BlockType.IMAGE, 'second'),
    ];
    const issues = findAssetReferenceIssues(
      blocks,
      new Map([['archived', asset('archived', { status: ContentStatus.ARCHIVED })]]),
      new Set(['archived']),
    );

    expect(issues).toEqual([]);
  });

  it('allows a READY asset to be used more than once', () => {
    const issues = findAssetReferenceIssues(
      [block('ready', BlockType.IMAGE, 'first'), block('ready', BlockType.IMAGE, 'second')],
      new Map([['ready', asset('ready')]]),
      new Set(),
    );

    expect(issues).toEqual([]);
  });

  it('reports the path for a new invalid reference when an existing reference is also kept', () => {
    const issues = findAssetReferenceIssues(
      [
        block('already-used', BlockType.IMAGE, 'existing'),
        block('new-archived', BlockType.IMAGE, 'new'),
      ],
      new Map([
        ['already-used', asset('already-used', { status: ContentStatus.ARCHIVED })],
        ['new-archived', asset('new-archived', { status: ContentStatus.ARCHIVED })],
      ]),
      new Set(['already-used']),
    );

    expect(issues).toMatchObject([{ path: 'blocks[1].assetId', code: 'ASSET_ARCHIVED' }]);
  });
});
