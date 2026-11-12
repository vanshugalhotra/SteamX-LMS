import { Badge } from '@/components/ui/badge';
import type { AssetDetail } from '../model/types';

const LESSON_STATUS = {
  ACTIVE: { label: 'Active', variant: 'success' },
  DRAFT: { label: 'Draft', variant: 'warning' },
  ARCHIVED: { label: 'Archived', variant: 'neutral' },
} as const;

export function AssetUsageList({ usedIn }: { usedIn: AssetDetail['usedIn'] }) {
  const hidden = usedIn.total - usedIn.items.length;

  return (
    <section className="rounded-3xl bg-gray-50 p-5" aria-labelledby="asset-usage-title">
      <h2 id="asset-usage-title" className="text-sm font-semibold">
        Where it&apos;s used
      </h2>
      <p className="mt-1 text-[11px] text-gray-600">Course → Module → Lesson</p>
      {usedIn.items.length === 0 ? (
        <p className="mt-4 text-xs text-gray-600">Not used in any lesson yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {usedIn.items.map((item) => {
            const status = LESSON_STATUS[item.lessonStatus];
            return (
              <li
                key={item.lessonId}
                className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white p-3 text-xs shadow-sm"
              >
                <span className="rounded-full bg-teal-100 px-3 py-1 font-medium text-teal-900">
                  {item.courseTitle}
                </span>
                <span aria-hidden="true" className="text-gray-600">
                  →
                </span>
                <span className="sr-only">, </span>
                <span className="rounded-full bg-yellow-100 px-3 py-1 font-medium text-yellow-900">
                  {item.moduleTitle}
                </span>
                <span aria-hidden="true" className="text-gray-600">
                  →
                </span>
                <span className="sr-only">, </span>
                <span className="rounded-full bg-coral-100 px-3 py-1 font-semibold text-coral-900">
                  {item.lessonTitle}
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && <p className="mt-3 text-[11px] text-gray-600">and {hidden} more.</p>}
    </section>
  );
}
