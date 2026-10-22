import { Badge } from '@/components/ui/badge';
import type { SchoolStatus } from '../model/types';

export function SchoolStatusBadge({ status }: { status: SchoolStatus }) {
  return status === 'ACTIVE' ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="danger">Inactive</Badge>
  );
}
