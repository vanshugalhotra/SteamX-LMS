import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { API_ERROR_CODE, getErrorMessage, getFieldErrors, hasErrorCode } from '@/lib/api-errors';
import type { Lesson, LessonContent, LessonContentBlock } from '../model/types';
import {
  countBlocks,
  findInvalidAccordionIds,
  findIncompleteBlockIds,
  insertBlock,
  moveBlock,
  removeBlockById,
  setBlockField,
  updateBlockById,
  type BlockTextField,
} from '../model/blocks';
import { useSaveLessonContent, useUpdateLesson } from '../queries';
import type { Asset } from '@/features/admin/assets/model/types';
import { LESSON_MAX_BLOCKS } from '../config/lessons.config';

export function useLessonEditor(lesson: Lesson, content: LessonContent) {
  const [title, setTitle] = useState(lesson.title);
  const [savedTitle, setSavedTitle] = useState(lesson.title);
  const [blocks, setBlocks] = useState(content.blocks);
  const [savedBlocks, setSavedBlocks] = useState(content.blocks);
  const [version, setVersion] = useState(content.version);
  const [titleIssue, setTitleIssue] = useState('');
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const saveContent = useSaveLessonContent();
  const updateLesson = useUpdateLesson();
  const pending = saveContent.isPending || updateLesson.isPending;

  const [assets, setAssets] = useState(content.assets);
  const [savedAssets, setSavedAssets] = useState(content.assets);
  const [attempted, setAttempted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const blocksChanged = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(savedBlocks),
    [blocks, savedBlocks],
  );
  const hasChanges = title.trim() !== savedTitle || blocksChanged;

  const incompleteIds = useMemo(
    () => (attempted ? findIncompleteBlockIds(blocks) : []),
    [attempted, blocks],
  );
  const invalidAccordionIds = useMemo(
    () => (attempted ? findInvalidAccordionIds(blocks) : []),
    [attempted, blocks],
  );

  const changeTitle = (value: string) => {
    setTitle(value);
    setTitleIssue('');
  };
  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleIssue('Add a title for this lesson.');
      return;
    }

    if (findIncompleteBlockIds(blocks).length > 0 || findInvalidAccordionIds(blocks).length > 0) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setTitleIssue('');
    setError(null);
    try {
      if (nextTitle !== savedTitle) {
        await updateLesson.mutateAsync({ id: lesson.id, body: { title: nextTitle } });
        setTitle(nextTitle);
        setSavedTitle(nextTitle);
      }
      if (blocksChanged) {
        const result = await saveContent.mutateAsync({
          id: lesson.id,
          body: { expectedVersion: version, blocks },
        });
        setBlocks(result.blocks);
        setAssets(result.assets);
        setSavedBlocks(result.blocks);
        setSavedAssets(result.assets);
        setVersion(result.version);
      }
    } catch (e) {
      const titleError = getFieldErrors(e).title;
      if (titleError) {
        setTitleIssue(titleError);
        return;
      }
      setError({
        conflict: hasErrorCode(e, API_ERROR_CODE.VERSION_CONFLICT),
        message: getErrorMessage(e, {
          VERSION_CONFLICT: 'This lesson changed while you were editing.',
        }),
      });
    }
  };

  const addBlock = (block: LessonContentBlock, index?: number) => {
    setAttempted(false);
    setBlocks((c) => (countBlocks(c) >= LESSON_MAX_BLOCKS ? c : insertBlock(c, block, index)));
  };
  const addColumnBlock = (parentId: string, column: 0 | 1, child: LessonContentBlock) => {
    setAttempted(false);
    setBlocks((current) => {
      if (countBlocks(current) >= LESSON_MAX_BLOCKS) return current;
      return updateBlockById(current, parentId, (block) => {
        if (block.type !== 'TWO_COLUMN') return block;
        const columns = block.columns ?? [null, null];
        if (columns[column]) return block;
        const next: [LessonContentBlock | null, LessonContentBlock | null] = [...columns];
        next[column] = child;
        return { ...block, columns: next };
      });
    });
  };
  const removeBlock = (id: string) => {
    setBlocks((c) => removeBlockById(c, id));
  };
  const move = (index: number, direction: -1 | 1) => {
    setBlocks((c) => moveBlock(c, index, direction));
  };
  const updateRichText = (id: string, doc: JSONContent) => {
    setBlocks((c) =>
      updateBlockById(c, id, (block) => {
        if (block.type === 'ACCORDION') {
          return {
            ...block,
            content: { ...block.content, body: { format: 'tiptap', doc } },
          };
        }
        return { ...block, content: { format: 'tiptap', doc } };
      }),
    );
  };
  const updateBlock = (id: string, update: (block: LessonContentBlock) => LessonContentBlock) => {
    setBlocks((c) => updateBlockById(c, id, update));
  };
  const attachAsset = (id: string, asset: Asset) => {
    setAssets((c) => ({ ...c, [asset.id]: asset }));
    updateBlock(id, (b) => ({ ...b, assetId: asset.id }));
  };
  const setField = (id: string, key: BlockTextField, value: string) => {
    updateBlock(id, (b) => setBlockField(b, key, value));
  };
  const setAccordionTitle = (id: string, title: string) => {
    updateBlock(id, (block) => ({
      ...block,
      content: { ...block.content, title },
    }));
  };
  const discardChanges = () => {
    setTitle(savedTitle);
    setBlocks(savedBlocks);
    setAssets(savedAssets);
    setTitleIssue('');
    setError(null);
    setAttempted(false);
    setResetKey((current) => current + 1);
  };

  return {
    title,
    setTitle: changeTitle,
    titleIssue,
    blocks,
    version,
    error,
    pending,
    hasChanges,
    resetKey,
    discardChanges,
    save,
    addBlock,
    addColumnBlock,
    removeBlock,
    move,
    updateRichText,
    assets,
    updateBlock,
    incompleteIds,
    invalidAccordionIds,
    attachAsset,
    setField,
    setAccordionTitle,
  };
}
