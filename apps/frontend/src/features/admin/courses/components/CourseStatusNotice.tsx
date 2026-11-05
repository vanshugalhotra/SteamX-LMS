import { Archive, CircleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ContentStatus } from '@/lib/content-status';

const notices: Partial<
  Record<ContentStatus, { icon: LucideIcon; className: string; text: string }>
> = {
  DRAFT: {
    icon: CircleAlert,
    className: 'bg-brand-draft text-brand-draft-ink',
    text: 'This course is a draft. Students can’t see its content until it’s active.',
  },
  ARCHIVED: {
    icon: Archive,
    className: 'bg-brand-chip text-gray-600',
    text: 'This course is archived. Released content stays available until it expires.',
  },
};

export function CourseStatusNotice({ status }: { status: ContentStatus }) {
  const notice = notices[status];
  if (!notice) return null;
  const Icon = notice.icon;

  return (
    <p
      role="note"
      className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-xs ${notice.className}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {notice.text}
    </p>
  );
}
