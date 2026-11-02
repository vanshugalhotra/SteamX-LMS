import { BookOpen } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button-link';
import { PATHS } from '@/lib/paths';
import type { Course } from '../model/types';
import { courseStatuses } from '../config/courses.config';
import { CourseStatusBadge } from './CourseStatusBadge';

export function CourseCard({ course }: { course: Course }) {
  const updatedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(course.updatedAt),
  );

  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md transition-shadow hover:shadow-lg">
      <div
        aria-hidden="true"
        className={`relative grid h-24 place-items-center overflow-hidden ${courseStatuses[course.status].bannerClass}`}
      >
        <span className="absolute -left-5 top-8 size-20 rounded-full bg-white/25" />
        <span className="absolute -right-3 -top-4 size-14 rounded-full bg-white/20" />
        <BookOpen className="relative size-9 text-indigo-950" />
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
        <div className="mt-auto flex items-center justify-end border-t border-gray-200 pt-3">
          {/* TODO(next PR): Replace this button with the reference menu: Edit, Archive, and View curriculum. */}
          <ButtonLink
            to={PATHS.admin.courseEdit(course.id)}
            variant="secondary"
            size="sm"
            className="border border-gray-200 bg-white text-foreground hover:bg-gray-100"
          >
            Edit course
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
