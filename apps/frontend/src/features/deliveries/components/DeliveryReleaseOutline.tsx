import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/date-helper';
import type { ReleaseModule, ReleaseOutlineResponse } from '../model/types';

function moduleReleaseLabel(module: ReleaseModule) {
  if (module.releasableLessonCount === 0) return 'No student lessons';
  if (module.releaseState === 'ALL') return 'Released';
  if (module.releaseState === 'PARTIAL') return 'Partly released';
  return 'Not released';
}

interface DeliveryReleaseOutlineProps {
  outline: ReleaseOutlineResponse;
}

export function DeliveryReleaseOutline({ outline }: DeliveryReleaseOutlineProps) {
  const [expandedModules, setExpandedModules] = useState(
    () => new Set(outline.modules.map((module) => module.id)),
  );

  const toggleModule = (moduleId: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  if (outline.modules.length === 0) {
    return (
      <div className="rounded-2xl bg-brand-side px-5 py-8 text-center">
        <h3 className="text-sm font-semibold">No active modules available</h3>
        <p className="mt-1 text-xs text-gray-600">
          Only active modules and lessons are shown. If you expect content here, ask your course
          administrator to activate the modules.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {outline.modules.map((module) => {
        const expanded = expandedModules.has(module.id);
        const lessonsId = `module-lessons-${module.id}`;

        return (
          <li key={module.id}>
            <section className="rounded-3xl bg-gray-50 p-2">
              <button
                type="button"
                aria-label={`Lessons in ${module.title}`}
                aria-expanded={expanded}
                aria-controls={lessonsId}
                onClick={() => {
                  toggleModule(module.id);
                }}
                className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/40 sm:px-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gray-50 text-brand-navy">
                  <ChevronDown
                    className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{module.title}</span>
                  <span className="block text-xs text-gray-600">
                    {module.releasedCount} of {module.releasableLessonCount} lessons released
                  </span>
                </span>
                <Badge
                  variant={
                    module.releaseState === 'ALL'
                      ? 'success'
                      : module.releaseState === 'PARTIAL'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {moduleReleaseLabel(module)}
                </Badge>
              </button>
              {expanded && (
                <ol id={lessonsId} className="px-3 py-2 sm:px-5">
                  {module.lessons.length > 0 ? (
                    module.lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="flex flex-wrap items-center gap-3 border-b border-gray-200 py-3 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{lesson.title}</span>
                          <span className="block text-xs text-gray-600">
                            {lesson.audience === 'TEACHER_ONLY'
                              ? 'Teacher only'
                              : lesson.releasedAt
                                ? `Released ${formatDate(lesson.releasedAt)}`
                                : 'Student lesson'}
                          </span>
                        </span>
                        {lesson.audience === 'TEACHER_ONLY' ? (
                          <Badge variant="neutral">Teacher only</Badge>
                        ) : (
                          <Badge
                            variant={
                              lesson.released
                                ? 'success'
                                : lesson.releasable
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {lesson.released
                              ? 'Released'
                              : lesson.releasable
                                ? 'Not released'
                                : 'Not releasable'}
                          </Badge>
                        )}
                      </li>
                    ))
                  ) : (
                    <li className="py-3 text-xs text-gray-600">No lessons in this module.</li>
                  )}
                </ol>
              )}
            </section>
          </li>
        );
      })}
    </ol>
  );
}
