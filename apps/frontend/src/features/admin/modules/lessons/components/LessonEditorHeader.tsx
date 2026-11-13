import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CourseStatusBadge } from '@/components/ui/CourseStatusBadge';
import { Spinner } from '@/components/ui/spinner';
import { SegmentedControl, type SegmentOption } from '@/components/ui/segmented-control';
import { Eye, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Lesson } from '../model/types';
import { LESSON_TITLE_MAX_LENGTH } from '../config/lessons.config';

export type LessonEditorView = 'edit' | 'preview';

const VIEW_OPTIONS: SegmentOption<LessonEditorView>[] = [
  { value: 'edit', label: 'Edit', icon: PencilLine },
  { value: 'preview', label: 'Preview', icon: Eye },
];

function SaveStatus({ pending, hasChanges }: { pending: boolean; hasChanges: boolean }) {
  const label = pending ? 'Saving…' : hasChanges ? 'Unsaved changes' : 'All changes saved';
  const dotClassName = pending
    ? 'bg-yellow-500 animate-pulse'
    : hasChanges
      ? 'bg-yellow-500'
      : 'bg-teal-400';
  return (
    <p
      role="status"
      className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
    >
      <span className={cn('size-2 rounded-full', dotClassName)} aria-hidden="true" />
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
  view,
  onViewChange,
  onTitleChange,
  onDiscard,
  onSave,
}: {
  lesson: Lesson;
  title: string;
  titleIssue: string;
  version: number;
  hasChanges: boolean;
  pending: boolean;
  view: LessonEditorView;
  onViewChange: (view: LessonEditorView) => void;
  onTitleChange: (title: string) => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-brand-line bg-white pb-4 pt-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0 flex-1 xl:min-w-70">
        {view === 'edit' ? (
          <>
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
          </>
        ) : (
          <h1 className="text-xl font-semibold">{title}</h1>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CourseStatusBadge status={lesson.status} />
          <Badge variant="neutral">
            {lesson.audience === 'TEACHER_ONLY' ? 'Teachers only' : 'Student lesson'}
          </Badge>
          <span className="text-xs text-gray-600">Version {String(version)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:flex-nowrap xl:justify-end">
        <SegmentedControl
          label="View"
          hideLabel
          options={VIEW_OPTIONS}
          value={view}
          onChange={onViewChange}
        />
        <SaveStatus pending={pending} hasChanges={hasChanges} />
        <Button
          type="button"
          variant="secondary"
          disabled={!hasChanges || pending}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
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
