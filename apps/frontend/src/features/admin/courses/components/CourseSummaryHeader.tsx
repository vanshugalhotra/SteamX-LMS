import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { PATHS } from '@/lib/paths';
import type { CourseOutline } from '../model/types';
import { CourseStatusNotice } from './CourseStatusNotice';
import { CourseHero } from './CourseHero';
import { CourseStatusBadge } from '@/components/ui/CourseStatusBadge';
import { CourseStatusSection } from './CourseStatusSection';

export function CourseSummaryHeader({
  outline,
  onAddModule,
}: {
  outline: CourseOutline;
  onAddModule: () => void;
}) {
  const lessonCount = outline.modules.reduce((total, module) => total + module.lessons.length, 0);

  return (
    <>
      <CourseHero>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{outline.course.title}</h1>
              <CourseStatusBadge status={outline.course.status} />
            </div>
            <p className="mt-1 max-w-2xl text-xs">
              {outline.course.description?.length
                ? outline.course.description
                : 'No description yet.'}
            </p>
            <dl className="mt-6 flex gap-8">
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-[11px] font-medium">Modules</dt>
                <dd className="text-2xl font-semibold">{outline.modules.length}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-[11px] font-medium">Lessons</dt>
                <dd className="text-2xl font-semibold">{lessonCount}</dd>
              </div>
            </dl>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <ButtonLink
              to={PATHS.admin.courseEdit(outline.course.id)}
              variant="secondary"
              className="rounded-full border border-brand-navy/40 bg-transparent text-brand-navy hover:bg-white/20"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit course
            </ButtonLink>
            <CourseStatusSection course={outline.course} compact />
            {outline.course.status !== 'ARCHIVED' && (
              <Button type="button" onClick={onAddModule} className="rounded-full bg-brand-navy">
                <Plus className="size-4" aria-hidden="true" />
                Add module
              </Button>
            )}
          </div>
        </div>
      </CourseHero>
      <CourseStatusNotice status={outline.course.status} />
    </>
  );
}
