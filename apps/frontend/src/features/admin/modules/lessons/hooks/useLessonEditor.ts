import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { API_ERROR_CODE, getErrorMessage, getFieldErrors, hasErrorCode } from '@/lib/api-errors';
import type { Lesson, LessonContent, LessonContentBlock } from '../model/types';
import {
  findIncompleteBlockIds,
  insertBlock,
  moveBlock,
  setBlockField,
  type BlockTextField,
} from '../model/blocks';
import { useSaveLessonContent, useUpdateLesson } from '../queries';
import type { Asset } from '@/features/admin/assets/model/types';

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
  const [attempted, setAttempted] = useState(false);

  const blocksChanged = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(savedBlocks),
    [blocks, savedBlocks],
  );
  const hasChanges = title.trim() !== savedTitle || blocksChanged;

  const incompleteIds = useMemo(
    () => (attempted ? findIncompleteBlockIds(blocks) : []),
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

    if (findIncompleteBlockIds(blocks).length > 0) {
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
    setBlocks((c) => insertBlock(c, block, index));
  };
  const removeBlock = (id: string) => {
    setBlocks((c) => c.filter((b) => b.id !== id));
  };
  const move = (index: number, direction: -1 | 1) => {
    setBlocks((c) => moveBlock(c, index, direction));
  };
  const updateRichText = (id: string, doc: JSONContent) => {
    setBlocks((c) =>
      c.map((b) => (b.id === id ? { ...b, content: { format: 'tiptap', doc } } : b)),
    );
  };
  const updateBlock = (id: string, update: (block: LessonContentBlock) => LessonContentBlock) => {
    setBlocks((c) => c.map((b) => (b.id === id ? update(b) : b)));
  };
  const attachAsset = (id: string, asset: Asset) => {
    setAssets((c) => ({ ...c, [asset.id]: asset }));
    updateBlock(id, (b) => ({ ...b, assetId: asset.id }));
  };
  const setField = (id: string, key: BlockTextField, value: string) => {
    updateBlock(id, (b) => setBlockField(b, key, value));
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
    save,
    addBlock,
    removeBlock,
    move,
    updateRichText,
    assets,
    updateBlock,
    incompleteIds,
    attachAsset,
    setField,
  };
}
