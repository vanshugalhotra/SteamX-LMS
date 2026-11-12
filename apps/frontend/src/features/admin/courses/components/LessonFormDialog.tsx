import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useNativeDialog } from '@/components/ui/use-native-dialog';
import { getErrorMessage } from '@/lib/api-errors';
import type { CourseOutlineLesson } from '../model/types';
import type { LessonAudience } from '@/features/admin/modules/lessons/model/types';
import { LESSON_TITLE_MAX_LENGTH } from '@/features/admin/modules/lessons/config/lessons.config';

export function LessonFormDialog({
  lesson,
  pending,
  onSave,
  onClose,
}: {
  lesson: CourseOutlineLesson | null;
  pending: boolean;
  onSave: (title: string, audience: LessonAudience) => Promise<void>;
  onClose: () => void;
}) {
  const { dialogRef, close: closeDialog } = useNativeDialog();
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [audience, setAudience] = useState<LessonAudience>(lesson?.audience ?? 'STUDENT');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const close = () => {
    if (dialogRef.current?.open) closeDialog();
    else onClose();
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setTitleError('Enter a lesson title.');
      return;
    }

    setTitleError(null);
    setSubmitError(null);
    try {
      await onSave(normalizedTitle, audience);
      close();
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      aria-labelledby="lesson-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 bg-white p-6 text-brand-navy shadow-2xl backdrop:bg-ink/40"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <h2 id="lesson-dialog-title" className="text-lg font-semibold">
          {lesson ? 'Edit lesson' : 'Add lesson'}
        </h2>
        {!lesson && (
          <p className="mt-1 text-xs text-gray-600">
            New lessons start as drafts and can be published when they’re ready.
          </p>
        )}
        {submitError && <Alert className="mt-4">{submitError}</Alert>}
        <label htmlFor="lesson-title" className="mb-1 mt-5 block text-sm font-medium">
          Title <span aria-hidden="true">*</span>
        </label>
        <Input
          id="lesson-title"
          value={title}
          maxLength={LESSON_TITLE_MAX_LENGTH}
          autoComplete="off"
          autoFocus
          required
          aria-invalid={titleError !== null}
          aria-describedby={titleError ? 'lesson-title-error' : undefined}
          disabled={pending}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError(null);
            setSubmitError(null);
          }}
        />
        {titleError && (
          <p
            id="lesson-title-error"
            role="alert"
            className="mt-1 text-[11px] font-medium text-danger"
          >
            {titleError}
          </p>
        )}
        <label htmlFor="lesson-audience" className="mb-1 mt-4 block text-sm font-medium">
          Audience
        </label>
        <Select
          id="lesson-audience"
          value={audience}
          disabled={pending}
          onChange={(event) => {
            setAudience(event.target.value === 'TEACHER_ONLY' ? 'TEACHER_ONLY' : 'STUDENT');
          }}
        >
          <option value="STUDENT">Students</option>
          <option value="TEACHER_ONLY">Teachers only</option>
        </Select>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : lesson ? 'Save changes' : 'Add lesson'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
