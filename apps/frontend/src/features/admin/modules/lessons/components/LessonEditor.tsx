import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLessonEditor } from '../hooks/useLessonEditor';
import type { Lesson, LessonContent } from '../model/types';
import { BlockList } from './BlockList';
import { LessonEditorHeader } from './LessonEditorHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

// TODO(follow-up): image preview (useAssetAccess) and "open in Asset Library" on asset blocks,
// drag-and-drop reorder, outline sidebar, discard changes, conflict compare dialog,
// asset picker pagination.

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
  const missing = editor.incompleteIds.length;
  const invalidAccordions = editor.invalidAccordionIds.length;

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
      {missing > 0 && (
        <Alert>
          {`${String(missing)} ${missing === 1 ? 'block needs' : 'blocks need'} a file before this lesson can be saved.`}
        </Alert>
      )}
      {invalidAccordions > 0 && (
        <Alert>
          {`${String(invalidAccordions)} accordion ${invalidAccordions === 1 ? 'needs' : 'blocks need'} a title before this lesson can be saved.`}
        </Alert>
      )}
      <BlockList
        blocks={editor.blocks}
        assets={editor.assets}
        incompleteIds={editor.incompleteIds}
        invalidAccordionIds={editor.invalidAccordionIds}
        disabled={editor.pending}
        onAdd={editor.addBlock}
        onAddColumnBlock={editor.addColumnBlock}
        onMove={editor.move}
        onRemove={editor.removeBlock}
        onRichTextChange={editor.updateRichText}
        onAttachAsset={editor.attachAsset}
        onFieldChange={editor.setField}
        onAccordionTitleChange={editor.setAccordionTitle}
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
