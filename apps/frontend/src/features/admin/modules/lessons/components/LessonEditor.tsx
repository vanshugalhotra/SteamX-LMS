import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LessonContentView } from '@/components/lesson-content/LessonContentView';
import { useAssetAccess } from '@/features/admin/assets/queries';
import { useLessonEditor } from '../hooks/useLessonEditor';
import type { Lesson, LessonContent } from '../model/types';
import { BlockList } from './BlockList';
import { LessonEditorHeader, type LessonEditorView } from './LessonEditorHeader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

const useAdminAssetUrl = (assetId: string) => useAssetAccess(assetId);

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
  const [view, setView] = useState<LessonEditorView>('edit');
  const [discardOpen, setDiscardOpen] = useState(false);
  const blocker = useUnsavedChangesGuard(editor.hasChanges);
  const missing = editor.incompleteIds.length;
  const invalidAccordions = editor.invalidAccordionIds.length;

  return (
    <div className="min-w-0 space-y-5">
      <LessonEditorHeader
        lesson={lesson}
        title={editor.title}
        titleIssue={editor.titleIssue}
        version={editor.version}
        hasChanges={editor.hasChanges}
        pending={editor.pending}
        view={view}
        onViewChange={setView}
        onTitleChange={editor.setTitle}
        onDiscard={() => {
          setDiscardOpen(true);
        }}
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
      {view === 'edit' && missing > 0 && (
        <Alert>
          {`${String(missing)} ${missing === 1 ? 'block needs' : 'blocks need'} a file before this lesson can be saved.`}
        </Alert>
      )}
      {view === 'edit' && invalidAccordions > 0 && (
        <Alert>
          {`${String(invalidAccordions)} accordion ${invalidAccordions === 1 ? 'needs' : 'blocks need'} a title before this lesson can be saved.`}
        </Alert>
      )}
      {view === 'edit' ? (
        <BlockList
          key={editor.resetKey}
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
      ) : (
        <div className="min-w-0 max-w-full space-y-5 overflow-x-clip border-t border-brand-line pt-5">
          {editor.hasChanges && (
            <p
              className="inline-flex items-center gap-2 rounded-full bg-brand-draft px-3 py-1 text-xs font-medium text-brand-draft-ink"
              role="status"
            >
              <span className="size-2 rounded-full bg-yellow-500" aria-hidden="true" />
              Previewing unsaved changes
            </p>
          )}
          <LessonContentView
            blocks={editor.blocks}
            assets={editor.assets}
            useAssetUrl={useAdminAssetUrl}
          />
        </div>
      )}
      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description="Your unsaved title and lesson content changes will be lost."
        confirmLabel="Discard edits"
        pending={false}
        pendingLabel="Discarding…"
        onConfirm={() => {
          editor.discardChanges();
          setDiscardOpen(false);
        }}
        onCancel={() => {
          setDiscardOpen(false);
        }}
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
