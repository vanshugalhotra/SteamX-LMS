import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssetFileStatus,
  AssetType,
  BlockType,
  ContentStatus,
} from '../../src/generated/prisma/client.js';
import {
  buildSavedLessonTree,
  createTestAssetWithReadyFile,
  createTestCurriculumLesson,
  makeImageBlock,
  makeRichTextBlock,
  makeTwoColumnBlock,
  type TestLessonBlock,
} from '../support/factories/curriculum.js';
import { createTestAsset } from '../support/factories/assets.js';
import { assertStatus, startInvariantApi } from '../support/invariant-api.js';
import type { InvariantApi } from '../support/invariant-api.js';

const PNG_BYTES = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...Array(8).fill(0),
]);

type ContentBlock = TestLessonBlock;

type ContentResponse = { version: number; blocks: ContentBlock[]; assets: Record<string, unknown> };

describe('Lesson content invariants', () => {
  let api: InvariantApi;
  let cookie: string;

  beforeAll(async () => {
    api = await startInvariantApi();
    cookie = (await api.login()).cookie;
  });

  afterAll(async () => api?.close());

  async function getContent(lessonId: string) {
    const response = await api.send('GET', `/api/v1/lessons/${lessonId}/content`, { cookie });
    assertContentResponseContainsNoInternals(response.body);
    return response;
  }

  async function putContent(lessonId: string, body: object) {
    const response = await api.send('PUT', `/api/v1/lessons/${lessonId}/content`, {
      cookie,
      body,
    });
    assertContentResponseContainsNoInternals(response.body);
    return response;
  }

  async function assertTreeAndRows(lessonId: string): Promise<ContentResponse> {
    const response = await getContent(lessonId);
    assertStatus(response, 200);
    const content = response.body as ContentResponse;
    for (const block of content.blocks) {
      if (block.type !== BlockType.TWO_COLUMN) continue;
      expect(block.columns).toHaveLength(2);
      for (const child of block.columns ?? []) {
        expect(child?.type).not.toBe(BlockType.TWO_COLUMN);
      }
    }

    const rows = await api.prisma.lessonBlock.findMany({
      where: { lessonId },
      select: {
        id: true,
        type: true,
        assetId: true,
        position: true,
        parentBlockId: true,
        columnIndex: true,
      },
    });
    const topRows = rows
      .filter(({ parentBlockId }) => parentBlockId === null)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    expect(topRows.map(({ position }) => position)).toEqual(
      Array.from({ length: topRows.length }, (_, index) => index + 1),
    );

    for (const row of rows) {
      if (row.assetId === null) continue;
      const asset = await api.prisma.asset.findUniqueOrThrow({
        where: { id: row.assetId },
        select: { type: true },
      });
      expect(asset.type).toBe(row.type);
    }
    return content;
  }

  async function snapshot(lessonId: string) {
    const response = await getContent(lessonId);
    assertStatus(response, 200);
    const rows = await api.prisma.lessonBlock.findMany({
      where: { lessonId },
      orderBy: [{ position: 'asc' }, { columnIndex: 'asc' }, { id: 'asc' }],
    });
    const lesson = await api.prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: { contentVersion: true },
    });
    return { response: response.body, rows, version: lesson.contentVersion };
  }

  it('preserves tree, ordering, and asset invariants across mixed saves and no-op round trips', async () => {
    const { lessonId } = await createTestCurriculumLesson(api.prisma);
    const { assetId } = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
    let version = 0;

    for (let index = 0; index < 15; index++) {
      if (index % 2 === 0) {
        const blocks = buildSavedLessonTree(assetId, index);
        const saved = await putContent(lessonId, { expectedVersion: version, blocks });
        assertStatus(saved, 200);
        expect(saved.body.version).toBe(version + 1);
        version++;

        const read = await assertTreeAndRows(lessonId);
        expect(read.version).toBe(version);
        const roundTrip = await putContent(lessonId, {
          expectedVersion: read.version,
          blocks: read.blocks,
        });
        assertStatus(roundTrip, 200);
        expect(roundTrip.body.version).toBe(version);
      } else {
        const before = await snapshot(lessonId);
        const failed = await putContent(lessonId, {
          expectedVersion: version,
          blocks: [makeTwoColumnBlock([makeTwoColumnBlock([null, null]), null])],
        });
        expect(failed.status).toBe(400);
        expect(failed.status).toBeLessThan(500);
        expect(await snapshot(lessonId)).toEqual(before);
      }
      expect((await assertTreeAndRows(lessonId)).version).toBe(version);
    }
  });

  it('leaves response and persisted state unchanged for invalid, conflicting, missing, and oversized saves', async () => {
    const { lessonId } = await createTestCurriculumLesson(api.prisma);
    const foreignLesson = await createTestCurriculumLesson(api.prisma);
    const foreignBlockId = randomUUID();
    await api.prisma.lessonBlock.create({
      data: {
        id: foreignBlockId,
        lessonId: foreignLesson.lessonId,
        type: BlockType.RICH_TEXT,
        content: {},
        position: 1,
      },
    });
    const { assetId: pdfAssetId } = await createTestAssetWithReadyFile(api.prisma, AssetType.PDF);
    const { assetId: archivedAssetId } = await createTestAssetWithReadyFile(
      api.prisma,
      AssetType.IMAGE,
      { status: ContentStatus.ARCHIVED },
    );
    const unreadyAssetId = await createTestAsset(api.prisma, { type: AssetType.IMAGE });

    const initial = await putContent(lessonId, {
      expectedVersion: 0,
      blocks: [makeRichTextBlock()],
    });
    assertStatus(initial, 200);
    const current = initial.body as ContentResponse;
    const version = current.version;
    const duplicateId = randomUUID();
    const invalidLink = {
      id: randomUUID(),
      type: BlockType.RICH_TEXT,
      content: {
        format: 'tiptap',
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'unsafe',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
      },
    };
    const nestedLayout = makeTwoColumnBlock([makeTwoColumnBlock([null, null]), null]);

    const badCases: Array<{ name: string; status: number; lessonId?: string; body: object }> = [
      {
        name: 'stale version',
        status: 409,
        body: { expectedVersion: version - 1, blocks: [makeRichTextBlock()] },
      },
      { name: 'missing version', status: 400, body: { blocks: [] } },
      { name: 'negative version', status: 400, body: { expectedVersion: -1, blocks: [] } },
      { name: 'fractional version', status: 400, body: { expectedVersion: 1.5, blocks: [] } },
      {
        name: 'nested layout',
        status: 400,
        body: { expectedVersion: version, blocks: [nestedLayout] },
      },
      {
        name: '101 blocks',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: Array.from({ length: 101 }, () => makeRichTextBlock()),
        },
      },
      {
        name: 'duplicate ids',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [makeRichTextBlock(duplicateId), makeRichTextBlock(duplicateId)],
        },
      },
      {
        name: 'block id owned by another lesson',
        status: 400,
        body: { expectedVersion: version, blocks: [makeRichTextBlock(foreignBlockId)] },
      },
      {
        name: 'unsafe link',
        status: 400,
        body: { expectedVersion: version, blocks: [invalidLink] },
      },
      {
        name: 'unknown field',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [{ ...makeRichTextBlock(), unexpected: true }],
        },
      },
      {
        name: 'unknown asset',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [makeImageBlock(randomUUID())],
        },
      },
      {
        name: 'wrong asset type',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [makeImageBlock(pdfAssetId)],
        },
      },
      {
        name: 'new reference to archived asset',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [makeImageBlock(archivedAssetId)],
        },
      },
      {
        name: 'asset without a READY file',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [makeImageBlock(unreadyAssetId)],
        },
      },
      {
        name: 'asset block without asset id',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [{ id: randomUUID(), type: BlockType.IMAGE, content: {} }],
        },
      },
      {
        name: 'malformed asset id',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [{ ...makeImageBlock('not-a-uuid') }],
        },
      },
      {
        name: 'unsupported block type',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [{ id: randomUUID(), type: 'PPTX', content: {} }],
        },
      },
      {
        name: 'non-object content',
        status: 400,
        body: {
          expectedVersion: version,
          blocks: [{ id: randomUUID(), type: BlockType.RICH_TEXT, content: 'text' }],
        },
      },
      {
        name: 'unknown lesson',
        status: 404,
        lessonId: randomUUID(),
        body: { expectedVersion: version, blocks: current.blocks },
      },
      {
        name: 'body over 1 MB',
        status: 413,
        body: {
          expectedVersion: version,
          blocks: [],
          ignored: 'x'.repeat(1024 * 1024 + 128),
        },
      },
    ];

    for (const testCase of badCases) {
      const before = await snapshot(lessonId);
      const failed = await putContent(testCase.lessonId ?? lessonId, testCase.body);
      expect(failed.status, testCase.name).toBe(testCase.status);
      expect(failed.status, testCase.name).toBeLessThan(500);
      if (testCase.status === 413) {
        expect(failed.body).toMatchObject({
          statusCode: 413,
          code: 'PAYLOAD_TOO_LARGE',
          requestId: expect.any(String),
        });
      }
      expect(await snapshot(lessonId), testCase.name).toEqual(before);
    }
  });

  it('reports exact asset usage through nested blocks and preserves in-use assets through archive and access', async () => {
    const firstLesson = await createTestCurriculumLesson(api.prisma);
    const secondLesson = await createTestCurriculumLesson(api.prisma);
    const thirdLesson = await createTestCurriculumLesson(api.prisma);
    const firstAsset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
    const secondAsset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
    const unreadyAsset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);

    const saves = [
      {
        lessonId: firstLesson.lessonId,
        blocks: [
          makeImageBlock(firstAsset.assetId),
          makeTwoColumnBlock([null, makeImageBlock(secondAsset.assetId)]),
        ],
      },
      {
        lessonId: secondLesson.lessonId,
        blocks: [makeTwoColumnBlock([makeImageBlock(firstAsset.assetId), null])],
      },
    ];
    for (const save of saves) {
      assertStatus(
        await putContent(save.lessonId, { expectedVersion: 0, blocks: save.blocks }),
        200,
      );
    }

    const unreadyBlock = makeImageBlock(unreadyAsset.assetId);
    assertStatus(
      await putContent(thirdLesson.lessonId, { expectedVersion: 0, blocks: [unreadyBlock] }),
      200,
    );
    await api.prisma.assetFile.delete({ where: { id: unreadyAsset.fileId } });
    const unreadyRead = (await getContent(thirdLesson.lessonId)).body as ContentResponse;
    expect(unreadyRead.assets[unreadyAsset.assetId]).toMatchObject({
      file: null,
    });
    assertStatus(
      await putContent(thirdLesson.lessonId, {
        expectedVersion: unreadyRead.version,
        blocks: [unreadyBlock, makeRichTextBlock()],
      }),
      200,
    );

    for (const asset of [firstAsset, secondAsset]) {
      const expectedLessonIds = new Set<string>();
      for (const lesson of [firstLesson, secondLesson]) {
        const content = (await getContent(lesson.lessonId)).body as ContentResponse;
        const references = new Set<string>();
        const visit = (blocks: ContentBlock[]) => {
          for (const block of blocks) {
            if (block.assetId) references.add(block.assetId);
            if (block.columns)
              visit(block.columns.filter((child): child is ContentBlock => child !== null));
          }
        };
        visit(content.blocks);
        if (references.has(asset.assetId)) expectedLessonIds.add(lesson.lessonId);
      }
      const detail = await api.send('GET', `/api/v1/assets/${asset.assetId}`, { cookie });
      assertStatus(detail, 200);
      const usedIn = detail.body.usedIn as { items: Array<{ lessonId: string }> };
      expect(new Set(usedIn.items.map(({ lessonId }) => lessonId))).toEqual(expectedLessonIds);
    }

    const archive = await api.send('PATCH', `/api/v1/assets/${firstAsset.assetId}/status`, {
      cookie,
      body: { status: ContentStatus.ARCHIVED },
    });
    assertStatus(archive, 200);
    assertStatus(await api.send('DELETE', `/api/v1/assets/${firstAsset.assetId}`, { cookie }), 409);
    const archivedContent = (await getContent(firstLesson.lessonId)).body as ContentResponse;
    expect(archivedContent.assets[firstAsset.assetId]).toMatchObject({
      id: firstAsset.assetId,
      status: ContentStatus.ARCHIVED,
    });
    const access = await api.send('GET', `/api/v1/assets/${firstAsset.assetId}/access`, { cookie });
    assertStatus(access, 200);

    assertStatus(
      await putContent(firstLesson.lessonId, {
        expectedVersion: archivedContent.version,
        blocks: [makeRichTextBlock()],
      }),
      200,
    );
    const secondContent = (await getContent(secondLesson.lessonId)).body as ContentResponse;
    assertStatus(
      await putContent(secondLesson.lessonId, {
        expectedVersion: secondContent.version,
        blocks: [],
      }),
      200,
    );
    assertStatus(await api.send('DELETE', `/api/v1/assets/${firstAsset.assetId}`, { cookie }), 204);
  });

  it('keeps content trees stable while a READY asset file is replaced', async () => {
    const { lessonId } = await createTestCurriculumLesson(api.prisma);
    const asset = await createTestAssetWithReadyFile(api.prisma, AssetType.IMAGE);
    const blocks = buildSavedLessonTree(asset.assetId);
    assertStatus(await putContent(lessonId, { expectedVersion: 0, blocks }), 200);

    const replacement = await api.send('POST', `/api/v1/assets/${asset.assetId}/files`, {
      cookie,
      body: { filename: 'replacement.png', mimeType: 'image/png', sizeBytes: PNG_BYTES.length },
    });
    assertStatus(replacement, 201);
    const uploadUrl = (replacement.body as { upload: { url: string } }).upload.url;
    api.storage.simulateUpload(uploadUrl.replace('memory://upload/', ''), {
      bytes: PNG_BYTES,
      contentType: 'image/png',
    });
    const fileId = (replacement.body as { file: { id: string } }).file.id;
    assertStatus(
      await api.send('POST', `/api/v1/assets/${asset.assetId}/files/${fileId}/complete`, {
        cookie,
      }),
      200,
    );

    const content = (await getContent(lessonId)).body as ContentResponse;
    expect(content.blocks).toEqual(blocks);
    expect(content.assets[asset.assetId]).toMatchObject({
      file: { status: AssetFileStatus.READY, originalFilename: 'replacement.png' },
    });
    const roundTrip = await putContent(lessonId, {
      expectedVersion: content.version,
      blocks: content.blocks,
    });
    assertStatus(roundTrip, 200);
    expect(roundTrip.body.version).toBe(content.version);
    expect((await getContent(lessonId)).body.version).toBe(content.version);
  });
});

function assertContentResponseContainsNoInternals(value: unknown): void {
  const forbidden = new Set([
    'storagekey',
    'playbackkey',
    'uploadid',
    'processingjobid',
    'passwordhash',
  ]);
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (typeof entry !== 'object' || entry === null) return;
    for (const [key, child] of Object.entries(entry)) {
      expect(forbidden.has(key.toLowerCase()), `unexpected response property ${key}`).toBe(false);
      visit(child);
    }
  };
  visit(value);
}
