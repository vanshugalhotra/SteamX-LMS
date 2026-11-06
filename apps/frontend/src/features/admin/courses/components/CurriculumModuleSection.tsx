import { useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Check, ChevronDown, Pencil, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getErrorMessage } from '@/lib/api-errors';
import type { CourseOutlineModule, CourseOutlineLesson } from '../model/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { CurriculumLessonRow } from './CurriculumLessonRow';
import { CourseStatusBadge } from './CourseStatusBadge';

interface CurriculumModuleSectionProps {
  module: CourseOutlineModule;
  index: number;
  count: number;
  expanded: boolean;
  reordering: boolean;
  statusUpdating: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddLesson: () => void;
  onMove: (direction: -1 | 1) => Promise<void>;
  onPublish: () => Promise<void>;
  onArchive: () => Promise<void>;
  onEditLesson: (lesson: CourseOutlineLesson) => void;
  onMoveLesson: (lessonIndex: number, direction: -1 | 1) => Promise<void>;
  onPublishLesson: (lesson: CourseOutlineLesson) => Promise<void>;
  onArchiveLesson: (lesson: CourseOutlineLesson) => Promise<void>;
  lessonReordering: boolean;
  lessonStatusUpdating: boolean;
}

export function CurriculumModuleSection({
  module,
  index,
  count,
  expanded,
  reordering,
  statusUpdating,
  onToggle,
  onEdit,
  onAddLesson,
  onMove,
  onPublish,
  onArchive,
  onEditLesson,
  onMoveLesson,
  onPublishLesson,
  onArchiveLesson,
  lessonReordering,
  lessonStatusUpdating,
}: CurriculumModuleSectionProps) {
  const [confirmStatus, setConfirmStatus] = useState<'ACTIVE' | 'ARCHIVED' | null>(null);
  const [lessonStatusAction, setLessonStatusAction] = useState<{
    lesson: CourseOutlineLesson;
    status: 'ACTIVE' | 'ARCHIVED';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canArchive = module.status !== 'ARCHIVED';
  const canPublish = module.status !== 'ACTIVE';
  const publishLabel = module.status === 'ARCHIVED' ? 'Publish module again' : 'Publish module';
  const lessonStatusTitle = lessonStatusAction ? lessonStatusAction.lesson.title : '';
  const confirmationTitle = confirmStatus === 'ACTIVE' ? 'Publish module?' : 'Archive module?';
  const confirmationDescription =
    confirmStatus === 'ACTIVE'
      ? `“${module.title}” will be activated. The course must also be active before this module can be published.`
      : `“${module.title}” and its active lessons will be archived. They will no longer be available for new use.`;
  const confirmLabel = confirmStatus === 'ACTIVE' ? publishLabel : 'Archive module';
  const isLessonPublishing = lessonStatusAction?.status === 'ACTIVE';

  const move = async (direction: -1 | 1) => {
    setActionError(null);
    try {
      await onMove(direction);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const updateStatus = async () => {
    if (!confirmStatus) return;
    setActionError(null);
    try {
      if (confirmStatus === 'ACTIVE') await onPublish();
      else await onArchive();
      setConfirmStatus(null);
    } catch (error) {
      setConfirmStatus(null);
      setActionError(getErrorMessage(error));
    }
  };

  const updateLessonStatus = async () => {
    if (!lessonStatusAction) return;
    setActionError(null);
    try {
      if (isLessonPublishing) await onPublishLesson(lessonStatusAction.lesson);
      else await onArchiveLesson(lessonStatusAction.lesson);
      setLessonStatusAction(null);
    } catch (error) {
      setLessonStatusAction(null);
      setActionError(getErrorMessage(error));
    }
  };

  return (
    <section
      className={`rounded-3xl bg-brand-side p-2 ${
        module.status === 'ARCHIVED' ? 'opacity-80' : ''
      }`}
    >
      {actionError && <Alert className="mb-3">{actionError}</Alert>}
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`module-lessons-${module.id}`}
          aria-label={`Lessons in ${module.title}`}
          onClick={onToggle}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand-navy shadow-sm outline-none hover:bg-gray-100 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </button>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-sun text-[10px] font-semibold text-brand-navy">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold">{module.title}</h3>
          <p className="text-[11px] text-gray-600">
            {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
          </p>
        </div>
        <CourseStatusBadge status={module.status} />
        {module.status !== 'ARCHIVED' && (
          <Button
            type="button"
            size="sm"
            onClick={onAddLesson}
            className="rounded-full flex items-center gap-1.5 border border-gray-200 bg-white text-brand-navy hover:bg-gray-100"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add lesson
          </Button>
        )}
        <ActionMenu
          label={`Actions for module ${module.title}`}
          actions={[
            { label: 'Edit module', icon: Pencil, onSelect: onEdit },
            ...(canPublish
              ? [
                  {
                    label: publishLabel,
                    icon: Check,
                    onSelect: () => {
                      setConfirmStatus('ACTIVE');
                    },
                  },
                ]
              : []),
            {
              label: 'Move up',
              icon: ArrowUp,
              disabled: reordering || index === 0,
              onSelect: () => {
                void move(-1);
              },
            },
            {
              label: 'Move down',
              icon: ArrowDown,
              disabled: reordering || index === count - 1,
              onSelect: () => {
                void move(1);
              },
            },
            ...(canArchive
              ? [
                  {
                    label: 'Archive module',
                    icon: Archive,
                    danger: true,
                    onSelect: () => {
                      setConfirmStatus('ARCHIVED');
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>
      <ol
        id={`module-lessons-${module.id}`}
        hidden={!expanded}
        className="mt-2 space-y-2 px-2 pt-2"
      >
        {module.lessons.length === 0 ? (
          <li className="rounded-2xl border-2 border-dashed border-brand-line bg-white px-4 py-6 text-center text-xs text-gray-600">
            No lessons in this module yet.
          </li>
        ) : (
          module.lessons.map((lesson, lessonIndex) => (
            <CurriculumLessonRow
              key={lesson.id}
              lesson={lesson}
              index={lessonIndex}
              count={module.lessons.length}
              reordering={lessonReordering}
              onEdit={() => {
                onEditLesson(lesson);
              }}
              onMove={async (direction) => {
                await onMoveLesson(lessonIndex, direction);
              }}
              onRequestStatus={(status) => {
                setLessonStatusAction({ lesson, status });
              }}
            />
          ))
        )}
      </ol>
      <ConfirmDialog
        open={confirmStatus !== null}
        title={confirmationTitle}
        description={confirmationDescription}
        confirmLabel={confirmLabel}
        pending={statusUpdating}
        pendingLabel={confirmStatus === 'ACTIVE' ? 'Publishing…' : 'Archiving…'}
        onConfirm={() => {
          void updateStatus();
        }}
        onCancel={() => {
          if (!statusUpdating) setConfirmStatus(null);
        }}
      />
      <ConfirmDialog
        open={lessonStatusAction !== null}
        title={isLessonPublishing ? 'Publish lesson?' : 'Archive lesson?'}
        description={
          isLessonPublishing
            ? `“${lessonStatusTitle}” will be activated. Its module must also be active before this lesson can be published.`
            : `“${lessonStatusTitle}” will be archived and no longer available for new use.`
        }
        confirmLabel={isLessonPublishing ? 'Publish lesson' : 'Archive lesson'}
        pending={lessonStatusUpdating}
        pendingLabel={isLessonPublishing ? 'Publishing…' : 'Archiving…'}
        onConfirm={() => {
          void updateLessonStatus();
        }}
        onCancel={() => {
          if (!lessonStatusUpdating) setLessonStatusAction(null);
        }}
      />
    </section>
  );
}
