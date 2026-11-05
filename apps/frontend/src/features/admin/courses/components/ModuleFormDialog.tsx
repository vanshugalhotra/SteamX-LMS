import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNativeDialog } from '@/components/ui/use-native-dialog';
import { getErrorMessage } from '@/lib/api-errors';
import { COURSE_MODULE_TITLE_MAX_LENGTH } from '@/features/admin/modules/config/modules.config';
import type { CourseOutlineModule } from '../model/types';

interface ModuleFormDialogProps {
  module: CourseOutlineModule | null;
  pending: boolean;
  onSave: (title: string) => Promise<void>;
  onClose: () => void;
}

export function ModuleFormDialog({ module, pending, onSave, onClose }: ModuleFormDialogProps) {
  const { dialogRef, close: closeDialog } = useNativeDialog();
  const [title, setTitle] = useState(module?.title ?? '');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = module !== null;

  const close = () => {
    if (dialogRef.current?.open) closeDialog();
    else onClose();
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setTitleError('Enter a module title.');
      return;
    }

    setTitleError(null);
    setSubmitError(null);
    try {
      await onSave(normalizedTitle);
      close();
    } catch (saveError) {
      setSubmitError(getErrorMessage(saveError));
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="module-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 bg-white p-6 text-brand-navy shadow-2xl backdrop:bg-ink/40"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h2 id="module-dialog-title" className="text-lg font-semibold">
          {isEditing ? 'Edit module' : 'Add module'}
        </h2>
        {!isEditing && (
          <p className="mt-1 text-xs text-gray-600">
            New modules start as drafts and can be activated when they are ready.
          </p>
        )}
        {submitError && <Alert className="mt-4">{submitError}</Alert>}
        <label htmlFor="module-title" className="mb-1 mt-5 block text-sm font-medium">
          Title <span aria-hidden="true">*</span>
        </label>
        <Input
          id="module-title"
          value={title}
          maxLength={COURSE_MODULE_TITLE_MAX_LENGTH}
          autoComplete="off"
          autoFocus
          required
          placeholder="e.g. Robot Design and Sensors"
          aria-invalid={titleError !== null}
          aria-describedby={titleError ? 'module-title-error' : undefined}
          disabled={pending}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(null);
            setSubmitError(null);
          }}
        />
        {titleError && (
          <p
            id="module-title-error"
            role="alert"
            className="mt-1 text-[11px] font-medium text-danger"
          >
            {titleError}
          </p>
        )}
        <p className="mt-1 text-right text-[11px] text-gray-600">
          {title.length}/{COURSE_MODULE_TITLE_MAX_LENGTH}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={close}
            className="rounded-full border border-brand-line bg-white px-5 text-brand-navy hover:bg-brand-chip"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="rounded-full px-5">
            {pending ? 'Saving…' : isEditing ? 'Save changes' : 'Add module'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
