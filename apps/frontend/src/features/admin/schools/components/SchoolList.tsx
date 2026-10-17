import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { School } from '../api/api';
import { Pencil } from 'lucide-react';

const COLUMNS = 'md:grid-cols-[2fr_1.4fr_1.6fr_.8fr_auto]';

function StatusBadge({ status }: { status: School['status'] }) {
  const active = status === 'ACTIVE';
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[10px] font-semibold',
        active ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600',
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function SchoolRow({ school, onEdit }: { school: School; onEdit: (school: School) => void }) {
  return (
    <li
      className={cn(
        'grid items-center gap-x-4 gap-y-2 rounded-xl bg-white p-3 shadow-sm md:grid',
        COLUMNS,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{school.name}</p>
        <p className="truncate text-[11px] text-gray-600">{school.code}</p>
      </div>
      <p className="truncate text-xs">
        {school.city}, {school.state}
      </p>
      <div className="min-w-0 text-xs">
        <p className="truncate">{school.contactName ?? '-'}</p>
        <p className="truncate text-[11px] text-gray-600">
          {school.contactEmail ?? school.contactPhone ?? ''}
        </p>
      </div>
      <div>
        <StatusBadge status={school.status} />
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="border border-gray-200 bg-white text-foreground hover:bg-gray-100 md:justify-self-end"
        onClick={() => {
          onEdit(school);
        }}
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Button>
    </li>
  );
}

interface SchoolListProps {
  schools: School[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: (school: School) => void;
}

export function SchoolList({ schools, isPending, isError, onRetry, onEdit }: SchoolListProps) {
  if (isPending) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading schools">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <Alert>We couldn't load the schools. Please try again.</Alert>
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!schools?.length) {
    return <p className="p-8 text-center text-sm text-gray-600">No schools match your filters.</p>;
  }

  return (
    <div>
      <div
        className={cn(
          'hidden gap-x-4 px-3 pb-2 text-[10px] font-medium text-gray-600 md:grid',
          COLUMNS,
        )}
      >
        <span>School</span>
        <span>Location</span>
        <span>Contact</span>
        <span>Status</span>
        <span className="w-14" />
      </div>
      <ul className="space-y-2">
        {schools.map((school) => (
          <SchoolRow key={school.id} school={school} onEdit={onEdit} />
        ))}
      </ul>
    </div>
  );
}
