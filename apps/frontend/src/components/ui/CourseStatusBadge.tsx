import { Badge } from '@/components/ui/badge';
import { CONTENT_STATUS_PRESENTATION, type ContentStatus } from '@/lib/content-status';

export function CourseStatusBadge({ status }: { status: ContentStatus }) {
  const presentation = CONTENT_STATUS_PRESENTATION[status];
  return (
    <Badge variant="neutral" className={presentation.badgeClassName}>
      {presentation.label}
    </Badge>
  );
}