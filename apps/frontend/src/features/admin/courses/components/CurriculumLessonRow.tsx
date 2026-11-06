import { useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Check, Pencil, Presentation } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getErrorMessage } from '@/lib/api-errors';
import type { CourseOutlineLesson } from '../model/types';
import { CourseStatusBadge } from './CourseStatusBadge';

export function CurriculumLessonRow({
  lesson,
  index,
  count,
  reordering,
  onEdit,
  onMove,
  onRequestStatus,
}: {
  lesson: CourseOutlineLesson;
  index: number;
  count: number;
  reordering: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => Promise<void>;
  onRequestStatus: (status: 'ACTIVE' | 'ARCHIVED') => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const canPublish = lesson.status !== 'ACTIVE';
  const canArchive = lesson.status !== 'ARCHIVED';

  const move = async (direction: -1 | 1) => {
    setActionError(null);
    try {
      await onMove(direction);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ${
        lesson.status === 'ARCHIVED' ? 'opacity-60' : ''
      }`}
    >
      {actionError && <Alert className="w-full">{actionError}</Alert>}
      <span className="w-5 text-center text-[11px] text-gray-600">{index + 1}</span>
      <span className="min-w-0 flex-1 text-[13px] font-medium">{lesson.title}</span>
      {lesson.audience === 'TEACHER_ONLY' && (
        <Badge variant="neutral" className="bg-gray-100 text-gray-600">
          <Presentation className="size-3" aria-hidden="true" />
          Teachers only
        </Badge>
      )}
      <CourseStatusBadge status={lesson.status} />
      <ActionMenu
        label={`Actions for lesson ${lesson.title}`}
        actions={[
          { label: 'Edit lesson', icon: Pencil, onSelect: onEdit },
          ...(canPublish
            ? [
                {
                  label: lesson.status === 'ARCHIVED' ? 'Publish lesson again' : 'Publish lesson',
                  icon: Check,
                  onSelect: () => {
                    onRequestStatus('ACTIVE');
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
                  label: 'Archive lesson',
                  icon: Archive,
                  danger: true,
                  onSelect: () => {
                    onRequestStatus('ARCHIVED');
                  },
                },
              ]
            : []),
        ]}
      />
    </li>
  );
}
