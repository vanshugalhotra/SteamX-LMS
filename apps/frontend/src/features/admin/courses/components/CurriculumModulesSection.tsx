import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { CourseOutline, CourseOutlineModule } from '../model/types';
import {
  useCreateCourseModule,
  useReorderCourseModules,
  useUpdateCourseModule,
  useUpdateCourseModuleStatus,
} from '@/features/admin/modules/queries';
import { CurriculumModuleSection } from './CurriculumModuleSection';
import { ModuleFormDialog } from './ModuleFormDialog';

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const reordered = [...items];
  if (from < 0 || to < 0 || from >= reordered.length || to >= reordered.length) {
    return reordered;
  }
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  return reordered;
}

export function CurriculumModulesSection({
  outline,
  moduleDialog,
  setModuleDialog,
}: {
  outline: CourseOutline;
  moduleDialog: CourseOutlineModule | 'new' | null;
  setModuleDialog: (dialog: CourseOutlineModule | 'new' | null) => void;
}) {
  const [collapsedModules, setCollapsedModules] = useState(() => new Set<string>());
  const createModule = useCreateCourseModule();
  const updateModule = useUpdateCourseModule();
  const updateModuleStatus = useUpdateCourseModuleStatus();
  const reorderModules = useReorderCourseModules();
  const allExpanded = outline.modules.every((module) => !collapsedModules.has(module.id));
  const moduleMutationPending =
    createModule.isPending || updateModule.isPending || updateModuleStatus.isPending;

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

  const saveModule = async (title: string) => {
    if (moduleDialog === 'new') {
      await createModule.mutateAsync({ courseId: outline.course.id, body: { title } });
      toast.success('Module added as Draft');
    } else if (moduleDialog) {
      await updateModule.mutateAsync({ id: moduleDialog.id, body: { title } });
      toast.success('Module updated');
    }
  };

  const moveModule = async (index: number, direction: -1 | 1) => {
    const reordered = moveItem(outline.modules, index, index + direction);
    await reorderModules.mutateAsync({
      courseId: outline.course.id,
      body: { moduleIds: reordered.map((module) => module.id) },
    });
  };

  return (
    <section aria-labelledby="curriculum-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="curriculum-title" className="text-base font-semibold">
            Curriculum
          </h2>
          <p className="text-xs text-gray-600">Organize modules and their lessons.</p>
        </div>
        <div className="flex items-center gap-2">
          {outline.modules.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="h-auto rounded-none bg-transparent p-0 text-[11px] font-semibold text-brand-navy hover:bg-transparent hover:underline"
              onClick={toggleAll}
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  Collapse all
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  Expand all
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {outline.modules.length === 0 ? (
        <div className="rounded-3xl bg-brand-side px-6 py-12 text-center">
          <h3 className="text-sm font-semibold">No modules yet</h3>
          <p className="mt-1 text-xs text-gray-600">
            Modules and lessons will appear here once they have been added to this course.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {outline.modules.map((module, index) => (
            <CurriculumModuleSection
              key={module.id}
              module={module}
              index={index}
              count={outline.modules.length}
              expanded={!collapsedModules.has(module.id)}
              reordering={reorderModules.isPending}
              archiving={updateModuleStatus.isPending}
              onToggle={() => {
                toggleModule(module.id);
              }}
              onEdit={() => {
                setModuleDialog(module);
              }}
              onMove={(direction) => moveModule(index, direction)}
              onArchive={async () => {
                await updateModuleStatus.mutateAsync({ id: module.id, status: 'ARCHIVED' });
                toast.success('Module archived');
              }}
            />
          ))}
        </div>
      )}
      {moduleDialog && (
        <ModuleFormDialog
          module={moduleDialog === 'new' ? null : moduleDialog}
          pending={moduleMutationPending}
          onSave={saveModule}
          onClose={() => {
            setModuleDialog(null);
          }}
        />
      )}
    </section>
  );
}
