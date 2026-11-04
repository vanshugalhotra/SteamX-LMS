import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { ApiError } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import type { CourseOutline, CourseOutlineModule } from '../model/types';
import { CourseStatusBadge } from '../components/CourseStatusBadge';
import { CourseStatusSection } from '../components/CourseStatusSection';
import { useCourseOutline } from '../queries';

function CourseCurriculumContent({ outline }: { outline: CourseOutline }) {
  const [collapsedModules, setCollapsedModules] = useState(() => new Set<string>());
  const lessonCount = outline.modules.reduce((total, module) => total + module.lessons.length, 0);
  const allExpanded = outline.modules.every((module) => !collapsedModules.has(module.id));

  const toggleModule = (moduleId: string) => {
    setCollapsedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const toggleAll = () => {
    setCollapsedModules(
      allExpanded ? new Set(outline.modules.map((module) => module.id)) : new Set(),
    );
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-teal-500 px-6 py-7 text-indigo-950 sm:px-8 sm:py-8">
        <span
          aria-hidden="true"
          className="absolute -right-8 -top-10 size-44 rounded-full bg-coral-500"
        />
        <span
          aria-hidden="true"
          className="absolute right-24 top-16 size-20 rounded-full bg-yellow-400"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{outline.course.title}</h1>
              <CourseStatusBadge status={outline.course.status} />
            </div>
            <p className="mt-1 max-w-2xl text-sm">
              {outline.course.description ?? 'No description'}
            </p>
            <div className="mt-5 flex gap-8">
              <div>
                <p className="text-2xl font-bold">{outline.modules.length}</p>
                <p className="text-xs">Modules</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{lessonCount}</p>
                <p className="text-xs">Lessons</p>
              </div>
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <ButtonLink
              to={PATHS.admin.courseEdit(outline.course.id)}
              variant="secondary"
              className="rounded-full border border-indigo-950/30 bg-transparent text-indigo-950 hover:bg-white/20"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit course
            </ButtonLink>
            <CourseStatusSection course={outline.course} compact />
          </div>
        </div>
      </section>

      <section aria-labelledby="curriculum-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="curriculum-title" className="text-base font-semibold">
            Curriculum
          </h2>
          {outline.modules.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-full border border-teal-300 bg-white px-4 text-xs text-teal-900 shadow-sm hover:bg-teal-100"
              aria-expanded={allExpanded}
              onClick={toggleAll}
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="size-4" aria-hidden="true" />
                  Collapse all
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" aria-hidden="true" />
                  Expand all
                </>
              )}
            </Button>
          )}
        </div>
        {outline.modules.length === 0 ? (
          <div className="rounded-3xl bg-gray-50 px-6 py-12 text-center">
            <h3 className="text-sm font-semibold">No modules yet</h3>
            <p className="mt-1 text-xs text-gray-600">
              Modules and lessons will appear here once they have been added to this course.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {outline.modules.map((module, index) => (
              <ModuleSection
                key={module.id}
                module={module}
                index={index}
                expanded={!collapsedModules.has(module.id)}
                onToggle={() => {
                  toggleModule(module.id);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ModuleSection({
  module,
  index,
  expanded,
  onToggle,
}: {
  module: CourseOutlineModule;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-3xl bg-gray-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`module-lessons-${module.id}`}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${module.title}`}
          onClick={onToggle}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-gray-700 shadow-sm outline-none hover:bg-gray-100 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </button>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-yellow-400 text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{module.title}</h3>
          <p className="text-[11px] text-gray-600">
            {module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}
          </p>
        </div>
        <CourseStatusBadge status={module.status} />
      </div>
      <ol
        id={`module-lessons-${module.id}`}
        hidden={!expanded}
        className="mt-3 space-y-2 border-t border-gray-200 pt-3"
      >
        {module.lessons.length === 0 ? (
          <li className="rounded-2xl bg-white px-4 py-4 text-xs text-gray-600">
            No lessons in this module yet.
          </li>
        ) : (
          module.lessons.map((lesson, lessonIndex) => (
            <li
              key={lesson.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3"
            >
              <span className="w-5 text-center text-[11px] text-gray-600">{lessonIndex + 1}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{lesson.title}</span>
              <Badge
                variant="neutral"
                className={
                  lesson.audience === 'STUDENT'
                    ? 'bg-[#f3e8ff] text-[#6b21a8]'
                    : 'bg-gray-100 text-gray-600'
                }
              >
                {lesson.audience === 'STUDENT' ? (
                  <>
                    <UserRound className="size-3" aria-hidden="true" />
                    Students
                  </>
                ) : (
                  'Teachers only'
                )}
              </Badge>
              <CourseStatusBadge status={lesson.status} />
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

export function CourseCurriculumPage() {
  const { id = '' } = useParams();
  const { data, isPending, error, isError, refetch } = useCourseOutline(id);
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-6">
      <Link
        to={PATHS.admin.courses}
        className="inline-flex items-center gap-1.5 rounded text-xs font-medium text-gray-600 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All courses
      </Link>
      {data ? (
        <>
          {isError && (
            <div className="space-y-3">
              <Alert>{notFound ? 'Course not found.' : getErrorMessage(error)}</Alert>
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}
          <CourseCurriculumContent key={id} outline={data} />
        </>
      ) : isPending ? (
        <div className="space-y-5" role="status" aria-label="Loading course curriculum">
          <div className="h-52 animate-pulse rounded-3xl bg-gray-100" />
          <div className="h-16 animate-pulse rounded-3xl bg-gray-100" />
          <div className="h-16 animate-pulse rounded-3xl bg-gray-100" />
        </div>
      ) : (
        <div className="space-y-3">
          <Alert>{notFound ? 'Course not found.' : getErrorMessage(error)}</Alert>
          <Button variant="secondary" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
