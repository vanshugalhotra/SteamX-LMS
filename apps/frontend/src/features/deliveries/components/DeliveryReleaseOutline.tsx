import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatDate } from '@/lib/date-helper';
import { getErrorMessage } from '@/lib/api-errors';
import {
  useReleaseDeliveryLesson,
  useReleaseDeliveryModule,
  useUnreleaseDeliveryModule,
  useUnreleaseDeliveryLesson,
} from '../queries';
import type { ReleaseModule, ReleaseOutlineResponse } from '../model/types';

function moduleReleaseLabel(module: ReleaseModule) {
  if (module.releasableLessonCount === 0) return 'No student lessons';
  if (module.releaseState === 'ALL') return 'Released';
  if (module.releaseState === 'PARTIAL') return 'Partly released';
  return 'Not released';
}

function getReleasedEligibleStudentLessons(module: ReleaseModule) {
  return module.lessons.filter(
    (lesson) => lesson.audience === 'STUDENT' && lesson.releasable && lesson.released,
  );
}

interface DeliveryReleaseOutlineProps {
  deliveryId: string;
  outline: ReleaseOutlineResponse;
  releaseDisabledReason?: string;
}

export function DeliveryReleaseOutline({
  deliveryId,
  outline,
  releaseDisabledReason,
}: DeliveryReleaseOutlineProps) {
  const [expandedModules, setExpandedModules] = useState(
    () => new Set(outline.modules.map((module) => module.id)),
  );
  const [moduleToUnrelease, setModuleToUnrelease] = useState<ReleaseModule | null>(null);
  const releaseLesson = useReleaseDeliveryLesson();
  const unreleaseLesson = useUnreleaseDeliveryLesson();
  const unreleaseModule = useUnreleaseDeliveryModule();
  const releaseModule = useReleaseDeliveryModule();
  const actionPending =
    releaseLesson.isPending ||
    unreleaseLesson.isPending ||
    unreleaseModule.isPending ||
    releaseModule.isPending;

  const toggleModule = (moduleId: string) => {
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const releaseOneLesson = async (lessonId: string) => {
    try {
      await releaseLesson.mutateAsync({ deliveryId, lessonId });
      toast.success('Lesson released');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const unreleaseOneLesson = async (lessonId: string) => {
    try {
      await unreleaseLesson.mutateAsync({ deliveryId, lessonId });
      toast.success('Lesson unreleased');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const releaseOneModule = async (moduleId: string) => {
    try {
      const result = await releaseModule.mutateAsync({ deliveryId, moduleId });
      toast.success(
        `${String(result.newlyReleased)} ${result.newlyReleased === 1 ? 'lesson' : 'lessons'} released${
          result.skippedNotReleasable > 0
            ? `; ${String(result.skippedNotReleasable)} not eligible`
            : ''
        }`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const confirmModuleUnrelease = async () => {
    if (!moduleToUnrelease) return;
    const lessons = getReleasedEligibleStudentLessons(moduleToUnrelease);
    try {
      const { succeeded, failures } = await unreleaseModule.mutateAsync({
        deliveryId,
        lessonIds: lessons.map((lesson) => lesson.id),
      });
      if (failures.length > 0) {
        toast.error(
          `${String(succeeded)} of ${String(lessons.length)} lessons unreleased; ${String(failures.length)} failed. ${getErrorMessage(failures[0])}`,
        );
      } else {
        toast.success(`${String(succeeded)} ${succeeded === 1 ? 'lesson' : 'lessons'} unreleased`);
      }
    } catch (error) {
      toast.error(`Module unrelease failed. ${getErrorMessage(error)}`);
    } finally {
      setModuleToUnrelease(null);
    }
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

  const moduleUnreleaseCount = moduleToUnrelease
    ? getReleasedEligibleStudentLessons(moduleToUnrelease).length
    : 0;

  return (
    <>
      <ol className="space-y-3">
        {outline.modules.map((module) => {
          const expanded = expandedModules.has(module.id);
          const lessonsId = `module-lessons-${module.id}`;
          const hasReleasedLessons = module.releasedCount > 0;
          const hasUnreleasedLessons = module.releasedCount < module.releasableLessonCount;

          return (
            <li key={module.id}>
              <section className="rounded-3xl bg-gray-50 p-2">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 sm:px-3">
                  <button
                    type="button"
                    aria-label={`Lessons in ${module.title}`}
                    aria-expanded={expanded}
                    aria-controls={lessonsId}
                    onClick={() => {
                      toggleModule(module.id);
                    }}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-xl px-1 py-1 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
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
                  <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
                    {hasUnreleasedLessons && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-brand-navy"
                        disabled={actionPending || Boolean(releaseDisabledReason)}
                        title={releaseDisabledReason}
                        onClick={() => {
                          void releaseOneModule(module.id);
                        }}
                      >
                        Release module
                      </Button>
                    )}
                    {hasReleasedLessons && (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full text-brand-navy"
                        disabled={actionPending}
                        onClick={() => {
                          setModuleToUnrelease(module);
                        }}
                      >
                        Unrelease module
                      </Button>
                    )}
                  </div>
                </div>
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
                            <>
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
                              {lesson.released ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full text-brand-navy"
                                  aria-label={`Unrelease ${lesson.title}`}
                                  disabled={actionPending}
                                  onClick={() => {
                                    void unreleaseOneLesson(lesson.id);
                                  }}
                                >
                                  Unrelease
                                </Button>
                              ) : (
                                lesson.releasable && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full text-brand-navy"
                                    aria-label={`Release ${lesson.title}`}
                                    disabled={actionPending || Boolean(releaseDisabledReason)}
                                    title={releaseDisabledReason}
                                    onClick={() => {
                                      void releaseOneLesson(lesson.id);
                                    }}
                                  >
                                    Release
                                  </Button>
                                )
                              )}
                            </>
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
      <ConfirmDialog
        open={moduleToUnrelease !== null}
        title="Unrelease module lessons?"
        description={`This will remove the release from ${String(moduleUnreleaseCount)} currently released student ${moduleUnreleaseCount === 1 ? 'lesson' : 'lessons'} in ${moduleToUnrelease?.title ?? 'this module'}.`}
        confirmLabel="Unrelease module"
        pending={unreleaseModule.isPending}
        pendingLabel="Unreleasing…"
        onConfirm={() => {
          void confirmModuleUnrelease();
        }}
        onCancel={() => {
          if (!unreleaseModule.isPending) setModuleToUnrelease(null);
        }}
      />
    </>
  );
}
