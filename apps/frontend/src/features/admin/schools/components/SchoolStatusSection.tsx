import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { School } from '../model/types';
import { schoolErrorMessage } from '../model/errors';
import { useUpdateSchoolStatus } from '../queries';
import { SchoolStatusBadge } from './SchoolStatusBadge';

export function SchoolStatusSection({ school, onDone }: { school: School; onDone: () => void }) {
  const mutation = useUpdateSchoolStatus();
  const isActive = school.status === 'ACTIVE';

  const change = () => {
    mutation.mutate(
      { id: school.id, status: isActive ? 'INACTIVE' : 'ACTIVE' },
      {
        onSuccess: () => {
          toast.success(isActive ? 'School deactivated' : 'School activated');
          onDone();
        },
        onError: (error) => {
          toast.error(schoolErrorMessage(error), { id: 'school-status-failed' });
        },
      },
    );
  };

  return (
    <div className="mb-4.5 rounded-2xl bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Status</p>
        <SchoolStatusBadge status={school.status} />
      </div>
      <p className="mt-1 text-[11px] text-gray-600">
        {isActive
          ? 'Deactivating a school stops its users from signing in.'
          : 'Activating a school lets its users sign in again.'}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3"
        disabled={mutation.isPending}
        onClick={change}
      >
        {mutation.isPending ? 'Saving…' : isActive ? 'Deactivate school' : 'Activate school'}
      </Button>
    </div>
  );
}
