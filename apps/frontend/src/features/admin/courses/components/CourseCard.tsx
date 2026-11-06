import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowRight, BookOpen, Check, Ellipsis, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ButtonLink } from '@/components/ui/button-link';
import { getErrorMessage } from '@/lib/api-errors';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/date-helper';
import {
  getAllowedCourseStatusTransitions,
  getCourseStatusActionLabel,
  getCourseStatusConfirmationDescription,
  getCourseStatusConfirmationTitle,
  type CourseStatusTransition,
} from '../model/status-transitions';
import { useCourseOutline, useUpdateCourseStatus } from '../queries';
import type { Course } from '../model/types';
import { courseStatuses } from '../config/courses.config';
import { CourseStatusBadge } from './CourseStatusBadge';

export function CourseCard({ course }: { course: Course }) {
  const updateStatus = useUpdateCourseStatus();
  const [nextStatus, setNextStatus] = useState<CourseStatusTransition | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const {
    data: outline,
    isPending: isOutlinePending,
    isError: isOutlineError,
  } = useCourseOutline(course.id);
  const updatedAt = formatDate(course.updatedAt);
  const statusActions = getAllowedCourseStatusTransitions(course.status);
  const moduleCount = outline?.modules.length;
  const lessonCount = outline?.modules.reduce((total, module) => total + module.lessons.length, 0);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);
  const confirmStatusChange = async () => {
    if (!nextStatus) return;
    const target = nextStatus;
    try {
      await updateStatus.mutateAsync({ id: course.id, status: target });
      setNextStatus(null);
      toast.success(target === 'ACTIVE' ? 'Course published' : 'Course archived');
    } catch (error) {
      setNextStatus(null);
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <div className="relative">
        <div
          aria-hidden="true"
          className={cn(
            'relative grid h-24 place-items-center overflow-hidden',
            courseStatuses[course.status].bannerClass,
          )}
        >
          <span className="absolute -left-5 top-8 size-20 rounded-full bg-white/25" />
          <span className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20" />
          <BookOpen className="relative size-9 text-indigo-950" />
        </div>
        <div ref={menuRef} className="absolute right-3 top-3">
          <button
            ref={menuTriggerRef}
            type="button"
            aria-label={`Actions for ${course.title}`}
            aria-expanded={menuOpen}
            aria-controls={`course-actions-${course.id}`}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
            className="grid size-9 place-items-center rounded-full bg-white text-indigo-950 shadow-sm outline-none transition hover:bg-gray-100 focus-visible:ring-4 focus-visible:ring-ring/40"
          >
            <Ellipsis className="size-5" aria-hidden="true" />
          </button>
          <div
            id={`course-actions-${course.id}`}
            role="group"
            aria-label={`Course actions for ${course.title}`}
            hidden={!menuOpen}
            className="absolute right-0 top-full z-20 mt-1.5 min-w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
          >
            <Link
              to={PATHS.admin.courseEdit(course.id)}
              onClick={() => {
                setMenuOpen(false);
              }}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-brand-navy outline-none hover:bg-gray-100 focus:bg-gray-100"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit course
            </Link>
            {statusActions.map((status) => {
              const Icon = status === 'ACTIVE' ? Check : Archive;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setNextStatus(status);
                  }}
                  className={cn(
                    'flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-medium outline-none',
                    status === 'ARCHIVED'
                      ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
                      : 'text-brand-navy hover:bg-gray-100 focus:bg-gray-100',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {getCourseStatusActionLabel(status, course.status)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex min-h-48 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold">{course.title}</h2>
          <CourseStatusBadge status={course.status} />
        </div>
        <p className="line-clamp-2 min-h-8 text-[11px] text-gray-600">
          {course.description ?? 'No description'}
        </p>
        <p className="text-[11px] text-gray-600">Updated {updatedAt}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3">
          <p className="text-[11px] text-gray-600">
            {isOutlinePending
              ? 'Loading counts…'
              : isOutlineError || moduleCount === undefined || lessonCount === undefined
                ? 'Counts unavailable'
                : `${String(moduleCount)} ${moduleCount === 1 ? 'module' : 'modules'} · ${String(lessonCount)} ${lessonCount === 1 ? 'lesson' : 'lessons'}`}
          </p>
          <ButtonLink
            to={PATHS.admin.courseCurriculum(course.id)}
            variant="secondary"
            size="sm"
            className="h-auto rounded-none bg-transparent px-0 py-0 text-indigo-950 hover:bg-transparent hover:text-teal-800"
          >
            View curriculum
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </ButtonLink>
        </div>
      </div>
      <ConfirmDialog
        open={nextStatus !== null}
        title={
          nextStatus
            ? getCourseStatusConfirmationTitle(nextStatus, course.status)
            : 'Change course status?'
        }
        description={
          nextStatus ? getCourseStatusConfirmationDescription(course.title, nextStatus) : ''
        }
        confirmLabel={
          nextStatus ? getCourseStatusActionLabel(nextStatus, course.status) : 'Confirm'
        }
        pending={updateStatus.isPending}
        pendingLabel="Updating…"
        onConfirm={() => {
          void confirmStatusChange();
        }}
        onCancel={() => {
          if (!updateStatus.isPending) setNextStatus(null);
        }}
      />
    </article>
  );
}
