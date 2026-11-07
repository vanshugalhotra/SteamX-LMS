import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CourseStatusBadge } from '@/features/admin/courses/components/CourseStatusBadge';
import { Spinner } from '@/components/ui/spinner';
import type { Lesson } from '../model/types';
import { LESSON_TITLE_MAX_LENGTH } from '../config/lessons.config';

function SaveStatus({ pending, hasChanges }: { pending: boolean; hasChanges: boolean }) {
  const { label, dot } = pending
    ? { label: 'Saving…', dot: 'bg-yellow-500 animate-pulse' }
    : hasChanges
      ? { label: 'Unsaved changes', dot: 'bg-yellow-500' }
      : { label: 'All changes saved', dot: 'bg-teal-400' };
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
    >
      <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </p>
  );
}

export function LessonEditorHeader({
  lesson,
  title,
  titleIssue,
  version,
  hasChanges,
  pending,
  onTitleChange,
  onSave,
}: {
  lesson: Lesson;
  title: string;
  titleIssue: string;
  version: number;
  hasChanges: boolean;
  pending: boolean;
  onTitleChange: (title: string) => void;
  onSave: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-4 border-b border-brand-line bg-white pb-4 pt-2">
      <div className="min-w-70 flex-1">
        <label htmlFor="lesson-title" className="sr-only">
          Lesson title
        </label>
        <Input
          id="lesson-title"
          className="text-xl font-semibold"
          maxLength={LESSON_TITLE_MAX_LENGTH}
          readOnly={pending}
          value={title}
          aria-invalid={titleIssue ? true : undefined}
          aria-describedby={titleIssue ? 'lesson-title-error' : undefined}
          onChange={(e) => {
            onTitleChange(e.target.value);
          }}
        />
        {titleIssue && (
          <p id="lesson-title-error" role="alert" className="mt-1 text-xs text-danger">
            {titleIssue}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CourseStatusBadge status={lesson.status} />
          <Badge variant="neutral">
            {lesson.audience === 'TEACHER_ONLY' ? 'Teachers only' : 'Student lesson'}
          </Badge>
          <span className="text-xs text-gray-600">Version {String(version)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SaveStatus pending={pending} hasChanges={hasChanges} />
        <Button
          type="button"
          className="min-w-36"
          disabled={!hasChanges || pending}
          onClick={onSave}
        >
          {pending && <Spinner className="size-4" />}
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </header>
  );
}
