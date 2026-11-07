// TODO(follow-up): insert block between blocks, drag-and-drop reorder, outline sidebar,
// discard changes, conflict compare dialog, unsaved-changes navigation guard (useBlocker + beforeunload).

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLessonEditor } from '../hooks/useLessonEditor';
import type { Lesson, LessonContent } from '../model/types';
import { BlockList } from './BlockList';
import { LessonEditorHeader } from './LessonEditorHeader';

export function LessonEditor({
  lesson,
  content,
  onReload,
}: {
  lesson: Lesson;
  content: LessonContent;
  onReload: () => void;
}) {
  const editor = useLessonEditor(lesson, content);

  return (
    <div className="space-y-5">
      <LessonEditorHeader
        lesson={lesson}
        title={editor.title}
        titleIssue={editor.titleIssue}
        version={editor.version}
        hasChanges={editor.hasChanges}
        pending={editor.pending}
        onTitleChange={editor.setTitle}
        onSave={() => void editor.save()}
      />
      {editor.error && (
        <Alert>
          {editor.error.message}
          {editor.error.conflict && (
            <Button type="button" variant="secondary" size="sm" onClick={onReload}>
              Reload latest version
            </Button>
          )}
        </Alert>
      )}
      <BlockList
        blocks={editor.blocks}
        disabled={editor.pending}
        onAdd={editor.addBlock}
        onMove={editor.move}
        onRemove={editor.removeBlock}
        onRichTextChange={editor.updateRichText}
      />
    </div>
  );
}
