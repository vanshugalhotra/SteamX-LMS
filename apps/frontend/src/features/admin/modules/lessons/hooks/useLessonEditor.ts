import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { API_ERROR_CODE, getErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { moveBlock } from '../model/blocks';
import type { Lesson, LessonContent, LessonContentBlock } from '../model/types';
import { useSaveLessonContent, useUpdateLesson } from '../queries';

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

  const blocksChanged = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(savedBlocks),
    [blocks, savedBlocks],
  );
  const hasChanges = title.trim() !== savedTitle || blocksChanged;

  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleIssue('Add a title for this lesson.');
      return;
    }
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
        setSavedBlocks(result.blocks);
        setVersion(result.version);
      }
    } catch (e) {
      setError({
        conflict: hasErrorCode(e, API_ERROR_CODE.VERSION_CONFLICT),
        message: getErrorMessage(e, {
          VERSION_CONFLICT: 'This lesson changed while you were editing.',
        }),
      });
    }
  };

  const addBlock = (block: LessonContentBlock) => {
    setBlocks((c) => [...c, block]);
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

  return {
    title,
    setTitle,
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
  };
}
