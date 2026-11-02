import { Badge } from '@/components/ui/badge';
import type { ContentStatus } from '@/lib/content-status';
import { courseStatuses } from '../config/courses.config';

export function CourseStatusBadge({ status }: { status: ContentStatus }) {
  const presentation = courseStatuses[status];
  return <Badge variant={presentation.badgeVariant}>{presentation.label}</Badge>;
}
