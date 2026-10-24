import { Badge } from '@/components/ui/badge';
import type { UserStatus } from '../model/types';

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return status === 'ACTIVE' ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="neutral">Inactive</Badge>
  );
}
