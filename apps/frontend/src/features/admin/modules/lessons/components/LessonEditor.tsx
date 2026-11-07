import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLessonEditor } from '../hooks/useLessonEditor';
import type { Lesson, LessonContent } from '../model/types';
import { BlockList } from './BlockList';
import { LessonEditorHeader } from './LessonEditorHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

// TODO(follow-up): image/video/PDF/accordion/column blocks and a type picker for the + divider,
// drag-and-drop reorder, outline sidebar, discard changes, conflict compare dialog.

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
  const blocker = useUnsavedChangesGuard(editor.hasChanges);

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
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Leave without saving?"
        description="You have unsaved changes. If you leave this page, they will be lost."
        confirmLabel="Leave page"
        pending={false}
        pendingLabel="Leaving…"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
      />
    </div>
  );
}
