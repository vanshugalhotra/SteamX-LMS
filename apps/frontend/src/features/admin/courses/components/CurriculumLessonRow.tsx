import { Presentation, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CourseOutlineLesson } from '../model/types';
import { CourseStatusBadge } from './CourseStatusBadge';

export function CurriculumLessonRow({
  lesson,
  index,
}: {
  lesson: CourseOutlineLesson;
  index: number;
}) {
  const isStudentAudience = lesson.audience === 'STUDENT';

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ${
        lesson.status === 'ARCHIVED' ? 'opacity-60' : ''
      }`}
    >
      <span className="w-5 text-center text-[11px] text-gray-600">{index + 1}</span>
      <span className="min-w-0 flex-1 text-[13px] font-medium">{lesson.title}</span>
      <Badge
        variant="neutral"
        className={
          isStudentAudience
            ? 'bg-brand-student text-brand-student-ink'
            : 'bg-gray-100 text-gray-600'
        }
      >
        {isStudentAudience ? (
          <>
            <UserRound className="size-3" aria-hidden="true" />
            Students
          </>
        ) : (
          <>
            <Presentation className="size-3" aria-hidden="true" />
            Teachers only
          </>
        )}
      </Badge>
      <CourseStatusBadge status={lesson.status} />
    </li>
  );
}
